import 'server-only';
import { createHash } from 'node:crypto';
import { eq, and, gte, lte } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import {
  uploadedFiles, imports, importCandidates, aiExtractions, transactions,
} from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { getStorage } from '@/lib/storage';
import { getAiProvider, AiUnavailableError, type ExtractedTransaction } from '@/lib/ai';
import { detectSourceKind, parseCsv, type ParsedSource, type SourceKind } from './parsers';
import { parseXlsx } from './parsers/xlsx';
import { parsePdf } from './parsers/pdf';
import {
  normalizeDate, normalizeAmount, inferTransactionType, resolveMerchant, detectDecimalHint,
  type DateFormatHint,
} from './normalize';
import { findDuplicate, findInternalDuplicates, normalizeMerchant, type DuplicateSubject } from '@/lib/finance/duplicates';
import { addDays } from '@/lib/finance/period';
import type { IsoDate, TxnType } from '@/lib/finance/types';
import type { LedgerCategory } from '@/lib/finance/types';

/**
 * The ingestion pipeline (spec §9, §45).
 *
 * The invariant this whole module exists to protect: NOTHING it produces touches the
 * `transactions` table. Everything lands in `import_candidates`, where it affects no
 * figure anywhere in the app until a human accepts it. Committing is a separate,
 * explicit step, and it is reversible.
 */

export interface IngestOptions {
  accountId: string | null;
  dateFormatHint?: DateFormatHint;
  currency?: string;
  businessClassification?: 'personal' | 'business';
  /** Skip candidates scoring above this as duplicates. */
  duplicateThreshold?: number;
  retention?: 'delete_after_extract' | 'keep' | 'ask';
}

export interface IngestResult {
  importId: string;
  fileId: string;
  sourceKind: SourceKind;
  candidateCount: number;
  duplicateCount: number;
  errorCount: number;
  warnings: string[];
  /** Set when an identical file was already imported (idempotency). */
  existingImportId?: string;
}

const CONFIDENCE_REVIEW_FLOOR = 70;

export async function ingestFile(
  repo: WorkspaceRepo,
  file: { filename: string; mime: string; bytes: Buffer },
  options: IngestOptions,
  today: IsoDate,
): Promise<IngestResult> {
  const { userId, workspaceId } = repo;
  const contentHash = createHash('sha256').update(file.bytes).digest('hex');

  // Idempotency: the same bytes must not create a second import (spec gap G6).
  const existing = await withUser(userId, (tx) =>
    tx.select({ id: imports.id })
      .from(uploadedFiles)
      .innerJoin(imports, eq(imports.fileId, uploadedFiles.id))
      .where(and(
        eq(uploadedFiles.workspaceId, workspaceId),
        eq(uploadedFiles.contentHash, contentHash),
      ))
      .limit(1),
  );
  if (existing[0]) {
    return {
      importId: existing[0].id, fileId: '', sourceKind: 'text',
      candidateCount: 0, duplicateCount: 0, errorCount: 0,
      warnings: ['This exact file has already been imported.'],
      existingImportId: existing[0].id,
    };
  }

  const sourceKind = detectSourceKind(file.filename, file.mime);

  /* ---- 1. Persist the file ---- */
  const fileRows = await withUser(userId, (tx) =>
    tx.insert(uploadedFiles).values({
      workspaceId, uploadedBy: userId,
      filename: file.filename, mime: file.mime, sizeBytes: file.bytes.length,
      contentHash, storageDriver: getStorage().name,
      retention: options.retention ?? 'ask',
    }).returning({ id: uploadedFiles.id }),
  );
  const fileId = fileRows[0]!.id;
  await getStorage().put(fileId, file.bytes, file.mime);
  await withUser(userId, (tx) =>
    tx.update(uploadedFiles).set({ storageKey: fileId }).where(eq(uploadedFiles.id, fileId)),
  );

  /* ---- 2. Open the import ---- */
  const importRows = await withUser(userId, (tx) =>
    tx.insert(imports).values({
      workspaceId, fileId, createdBy: userId,
      sourceKind, label: file.filename, status: 'extracting',
      options: options as unknown as Record<string, unknown>,
    }).returning({ id: imports.id }),
  );
  const importId = importRows[0]!.id;

  try {
    const result = await runExtraction(repo, importId, fileId, sourceKind, file, options, today);
    return { importId, fileId, sourceKind, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed';
    await withUser(userId, (tx) =>
      tx.update(imports).set({ status: 'failed', errorDetail: message }).where(eq(imports.id, importId)),
    );
    throw error;
  }
}

async function runExtraction(
  repo: WorkspaceRepo,
  importId: string,
  fileId: string,
  sourceKind: SourceKind,
  file: { filename: string; mime: string; bytes: Buffer },
  options: IngestOptions,
  today: IsoDate,
): Promise<Omit<IngestResult, 'importId' | 'fileId' | 'sourceKind'>> {
  const { userId, workspaceId } = repo;
  const warnings: string[] = [];
  const provider = getAiProvider();

  /* ---- 3. Parse ---- */
  let parsed: ParsedSource;
  let needsVision = false;

  if (sourceKind === 'csv' || sourceKind === 'text') {
    parsed = parseCsv(file.bytes.toString('utf8'));
  } else if (sourceKind === 'xlsx') {
    parsed = await parseXlsx(file.bytes);
  } else if (sourceKind === 'pdf') {
    const pdf = await parsePdf(file.bytes);
    parsed = pdf;
    needsVision = pdf.needsVision;
  } else if (sourceKind === 'image' || sourceKind === 'video_frames') {
    parsed = {
      kind: sourceKind, transactions: [], text: null,
      images: [{ data: file.bytes.toString('base64'), mediaType: file.mime, ref: file.filename }],
      warnings: [],
    };
    needsVision = true;
  } else {
    parsed = parseCsv(file.bytes.toString('utf8'));
  }
  warnings.push(...parsed.warnings);

  /* ---- 4. Extract with AI where deterministic parsing could not ---- */
  let extracted: ExtractedTransaction[] = parsed.transactions;
  let dateFormatHint: DateFormatHint = options.dateFormatHint ?? 'unknown';

  if (extracted.length === 0 && (needsVision || parsed.text)) {
    if (needsVision && !provider.capabilities.vision) {
      throw new AiUnavailableError(
        'Reading this file needs a vision-capable AI provider. Add an ANTHROPIC_API_KEY or OPENAI_API_KEY, or upload a CSV, Excel or text-based PDF instead.',
      );
    }

    const started = Date.now();
    try {
      const response = await provider.extractTransactions(
        needsVision
          ? {
              kind: 'image',
              content: parsed.images[0]!.data,
              mediaType: parsed.images[0]!.mediaType,
              filename: file.filename,
              currencyHint: options.currency,
              dateFormatHint,
            }
          : {
              kind: sourceKind === 'pdf' ? 'pdf_text' : 'text',
              content: parsed.text ?? '',
              filename: file.filename,
              currencyHint: options.currency,
              dateFormatHint,
            },
      );
      extracted = response.data.transactions;
      if (response.data.dateFormatHint && response.data.dateFormatHint !== 'unknown') {
        dateFormatHint = response.data.dateFormatHint;
      }
      if (response.data.notes) warnings.push(response.data.notes);

      await withUser(userId, (tx) =>
        tx.insert(aiExtractions).values({
          workspaceId, importId,
          provider: response.usage.provider, model: response.usage.model,
          operation: 'extract_transactions',
          inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens,
          latencyMs: response.usage.latencyMs, status: 'ok',
        }),
      );
    } catch (error) {
      await withUser(userId, (tx) =>
        tx.insert(aiExtractions).values({
          workspaceId, importId, provider: provider.name, model: 'unknown',
          operation: 'extract_transactions', latencyMs: Date.now() - started,
          status: 'error', error: error instanceof Error ? error.message : 'unknown',
        }),
      );
      throw error;
    }
  }

  if (extracted.length === 0) {
    await withUser(userId, (tx) =>
      tx.update(imports).set({
        status: 'review', candidateCount: 0,
        errorDetail: 'No transactions were found in this file.',
      }).where(eq(imports.id, importId)),
    );
    return { candidateCount: 0, duplicateCount: 0, errorCount: 0, warnings: [...warnings, 'No transactions were found in this file.'] };
  }

  /* ---- 5. Normalise, categorise, score ---- */
  const [categories, accounts, rules] = await Promise.all([
    repo.listCategories(), repo.listAccounts(), repo.listMerchantRules(),
  ]);
  const account = options.accountId ? accounts.find((a) => a.id === options.accountId) : undefined;
  const currency = options.currency ?? account?.currency ?? repo.baseCurrency;
  const decimalHint = detectDecimalHint(extracted.map((e) => e.amount));
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const leafIds = new Set(
    categories.filter((c) => !categories.some((x) => x.parentId === c.id)).map((c) => c.id),
  );

  const prepared = extracted.map((row, index) =>
    prepareCandidate(row, index, {
      currency, decimalHint, dateFormatHint, today,
      accountNormalBalance: account?.normalBalance ?? 'debit',
      categoryBySlug, leafIds, rules, categories,
      businessClassification: options.businessClassification ?? 'personal',
    }),
  );

  /* ---- 6. Duplicate detection against existing rows and within the batch ---- */
  const dates = prepared.map((p) => p.postedDate).filter((d): d is IsoDate => Boolean(d)).sort();
  const windowStart = dates[0] ? addDays(dates[0], -7) : today;
  const windowEnd = dates[dates.length - 1] ? addDays(dates[dates.length - 1]!, 7) : today;

  const existingRows = await withUser(userId, (tx) =>
    tx.select({
      id: transactions.id, postedDate: transactions.postedDate,
      amountMinor: transactions.amountMinor, merchantName: transactions.merchantName,
      description: transactions.description, accountId: transactions.accountId,
      source: transactions.source,
    }).from(transactions).where(and(
      eq(transactions.workspaceId, workspaceId),
      gte(transactions.postedDate, windowStart),
      lte(transactions.postedDate, windowEnd),
    )),
  );

  const existing: DuplicateSubject[] = existingRows.map((r) => ({
    id: r.id, postedDate: r.postedDate,
    amountMinor: BigInt(r.amountMinor as unknown as string),
    merchantName: r.merchantName, description: r.description,
    accountId: r.accountId, source: r.source ?? undefined,
  }));

  const internal = findInternalDuplicates(
    prepared.filter((p) => p.postedDate && p.amountMinor !== null).map((p) => ({
      id: p.key, postedDate: p.postedDate!, amountMinor: p.amountMinor!,
      merchantName: p.merchantName, description: p.description,
      accountId: options.accountId, source: sourceKind,
    })),
  );

  const threshold = options.duplicateThreshold ?? 72;
  let duplicateCount = 0;
  let errorCount = 0;

  const rows = prepared.map((p) => {
    let status: 'pending' | 'duplicate' | 'rejected' = 'pending';
    let duplicateOf: string | null = null;
    let duplicateScore: number | null = null;
    let duplicateReasons: unknown = null;

    if (p.error) {
      status = 'rejected';
      errorCount++;
    } else if (p.postedDate && p.amountMinor !== null) {
      const internalMatch = internal.get(p.key);
      if (internalMatch) {
        status = 'duplicate';
        duplicateScore = internalMatch.score;
        duplicateReasons = { scope: 'within this file', reasons: internalMatch.reasons };
        duplicateCount++;
      } else {
        const match = findDuplicate(
          {
            postedDate: p.postedDate, amountMinor: p.amountMinor,
            merchantName: p.merchantName, description: p.description,
            accountId: options.accountId, source: sourceKind,
          },
          existing,
        );
        if (match && match.score >= threshold) {
          status = 'duplicate';
          duplicateOf = match.candidateId;
          duplicateScore = match.score;
          duplicateReasons = { scope: 'already in your records', confidence: match.confidence, reasons: match.reasons };
          duplicateCount++;
        } else if (match) {
          duplicateScore = match.score;
          duplicateReasons = { scope: 'possible', confidence: match.confidence, reasons: match.reasons };
        }
      }
    }

    return {
      workspaceId, importId,
      postedDate: p.postedDate, description: p.description,
      originalDescription: p.originalDescription, merchantName: p.merchantName,
      amountMinor: p.amountMinor, currency,
      type: p.type, categoryId: p.categoryId, accountId: options.accountId,
      businessClassification: p.businessClassification,
      status, duplicateOfTransactionId: duplicateOf,
      duplicateScore, duplicateReasons,
      confidence: p.confidence, fieldConfidence: p.fieldConfidence,
      provenance: p.provenance, rawExtraction: p.raw,
      validationError: p.error, sortOrder: p.index,
    };
  });

  for (let i = 0; i < rows.length; i += 200) {
    await withUser(userId, (tx) => tx.insert(importCandidates).values(rows.slice(i, i + 200)));
  }

  await withUser(userId, (tx) =>
    tx.update(imports).set({
      status: 'review',
      candidateCount: rows.length,
      duplicateCount,
      errorCount,
    }).where(eq(imports.id, importId)),
  );

  return { candidateCount: rows.length, duplicateCount, errorCount, warnings };
}

/* ------------------------------------------------------------------ */
/* Candidate preparation                                               */
/* ------------------------------------------------------------------ */

interface PrepareContext {
  currency: string;
  decimalHint: ReturnType<typeof detectDecimalHint>;
  dateFormatHint: DateFormatHint;
  today: IsoDate;
  accountNormalBalance: 'debit' | 'credit';
  categoryBySlug: Map<string, LedgerCategory>;
  leafIds: Set<string>;
  rules: { pattern: string; matchType: string; categoryId: string | null; businessClassificationValue: string | null }[];
  categories: LedgerCategory[];
  businessClassification: 'personal' | 'business';
}

function prepareCandidate(row: ExtractedTransaction, index: number, ctx: PrepareContext) {
  const key = `c${index}`;
  const date = normalizeDate(row.date, ctx.dateFormatHint, ctx.today);
  const amount = normalizeAmount(row.amount, ctx.currency, ctx.decimalHint);

  const errors: string[] = [];
  if (!date.date) errors.push(`Could not read the date "${row.date}"`);
  if (amount.minor === null) errors.push(amount.error ?? `Could not read the amount "${row.amount}"`);

  // Direction: the explicit flag wins, then the printed sign.
  const moneyIn = row.direction === 'credit' ? true : row.direction === 'debit' ? false : !amount.wasNegative
    ? false : true;

  const typeDecision = inferTransactionType(row.description, moneyIn, ctx.accountNormalBalance);
  const merchant = resolveMerchant(row.description, row.merchant);

  // A user rule beats the lexicon, always — that is what "the AI learns your
  // preferences" actually means here (spec §4), and it is visible and reversible.
  let categoryId: string | null = null;
  let categoryConfidence = 0;
  let businessClassification = ctx.businessClassification;

  const haystack = `${row.description} ${row.merchant ?? ''}`.toLowerCase();
  for (const rule of ctx.rules) {
    if (!matchesRule(haystack, rule.pattern.toLowerCase(), rule.matchType)) continue;
    if (rule.categoryId && ctx.leafIds.has(rule.categoryId)) {
      categoryId = rule.categoryId;
      categoryConfidence = 98;
    }
    if (rule.businessClassificationValue === 'business' || rule.businessClassificationValue === 'personal') {
      businessClassification = rule.businessClassificationValue;
    }
    break;
  }

  if (!categoryId && merchant.categorySlug) {
    const cat = ctx.categoryBySlug.get(merchant.categorySlug);
    if (cat && ctx.leafIds.has(cat.id)) {
      categoryId = cat.id;
      categoryConfidence = merchant.confidence;
    }
  }

  const fieldConfidence = {
    date: date.confidence,
    amount: amount.confidence,
    description: row.confidence?.description ?? 90,
    merchant: merchant.confidence,
    category: categoryConfidence,
    type: typeDecision.confidence,
  };

  // Overall confidence is the weakest link: a perfectly read amount on an ambiguous
  // date still needs a human to look at it.
  const overall = Math.round(Math.min(
    fieldConfidence.date, fieldConfidence.amount, fieldConfidence.description,
  ));

  return {
    key,
    index,
    postedDate: date.date,
    description: row.description.slice(0, 300),
    originalDescription: row.description.slice(0, 300),
    merchantName: merchant.displayName.slice(0, 200),
    amountMinor: amount.minor,
    type: typeDecision.type as TxnType,
    categoryId,
    businessClassification,
    confidence: overall,
    fieldConfidence,
    error: errors.length > 0 ? errors.join('; ') : null,
    provenance: {
      sourceRef: row.sourceRef ?? null,
      rawDate: row.date,
      rawAmount: row.amount,
      dateAmbiguous: date.ambiguous,
      typeReason: typeDecision.reason,
    },
    raw: row as unknown as Record<string, unknown>,
    needsReview: overall < CONFIDENCE_REVIEW_FLOOR || date.ambiguous,
  };
}

function matchesRule(haystack: string, pattern: string, matchType: string): boolean {
  switch (matchType) {
    case 'exact': return haystack.trim() === pattern;
    case 'starts_with': return haystack.startsWith(pattern);
    case 'regex':
      try { return new RegExp(pattern, 'i').test(haystack); } catch { return false; }
    default: return haystack.includes(pattern);
  }
}

export { normalizeMerchant, CONFIDENCE_REVIEW_FLOOR };

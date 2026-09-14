import 'server-only';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { imports, importCandidates, transactions, uploadedFiles, merchantRules } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { WorkspaceRepo } from '@/lib/data/repository';
import { normalizeMerchant } from '@/lib/finance/duplicates';
import type { TxnType } from '@/lib/finance/types';

/**
 * Committing and rolling back an import (spec §26).
 *
 * Rollback is the feature that makes people willing to try bulk import at all: if an
 * import adds 100 wrong rows, one click removes exactly those 100 and nothing else.
 * That works because every committed row carries its `import_id`, and because
 * deletion is soft — a rollback is reversible too.
 */

export interface CommitResult {
  imported: number;
  skipped: number;
  failed: { candidateId: string; reason: string }[];
}

export async function commitImport(
  repo: WorkspaceRepo,
  importId: string,
  options: { learnRules?: boolean } = {},
): Promise<CommitResult> {
  const { userId, workspaceId } = repo;

  const importRow = await withUser(userId, (tx) =>
    tx.select().from(imports)
      .where(and(eq(imports.id, importId), eq(imports.workspaceId, workspaceId)))
      .limit(1),
  );
  const current = importRow[0];
  if (!current) throw new Error('Import not found');
  if (current.status === 'committed') throw new Error('This import has already been committed');
  if (current.status === 'rolled_back') throw new Error('This import was rolled back and cannot be committed');

  const candidates = await withUser(userId, (tx) =>
    tx.select().from(importCandidates)
      .where(and(
        eq(importCandidates.importId, importId),
        eq(importCandidates.workspaceId, workspaceId),
      ))
      .orderBy(importCandidates.sortOrder),
  );

  const accounts = await repo.listAccounts();
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const failed: CommitResult['failed'] = [];
  let imported = 0;
  let skipped = 0;

  await withUser(userId, async (tx) => {
    for (const candidate of candidates) {
      // Only rows a human accepted are written. Everything else is left as a record
      // of what was proposed and what happened to it.
      if (candidate.status !== 'accepted') {
        skipped++;
        continue;
      }

      const account = candidate.accountId ? accountById.get(candidate.accountId) : undefined;
      if (!account) {
        failed.push({ candidateId: candidate.id, reason: 'No account selected' });
        continue;
      }
      if (!candidate.postedDate || candidate.amountMinor === null) {
        failed.push({ candidateId: candidate.id, reason: 'Missing date or amount' });
        continue;
      }

      const magnitude = abs(BigInt(candidate.amountMinor as unknown as string));
      const type = candidate.type as TxnType;

      // Sign in the account's own direction, exactly as the manual-entry path does.
      const increasesAccount =
        type === 'income' || type === 'refund'
          ? account.normalBalance === 'debit'
          : account.normalBalance === 'credit';
      const signed = increasesAccount ? magnitude : -magnitude;

      try {
        const inserted = await tx.insert(transactions).values({
          workspaceId,
          accountId: account.id,
          postedDate: candidate.postedDate,
          description: candidate.description ?? 'Imported transaction',
          originalDescription: candidate.originalDescription,
          merchantName: candidate.merchantName,
          amountMinor: signed,
          currency: candidate.currency,
          baseAmountMinor: signed,
          baseCurrency: repo.baseCurrency,
          type,
          categoryId: candidate.categoryId,
          businessClassification: candidate.businessClassification,
          notes: candidate.notes,
          source: sourceFor(current.sourceKind),
          importId,
          aiConfidence: candidate.confidence,
          needsReview: (candidate.confidence ?? 100) < 70,
          provenance: candidate.provenance,
          createdBy: userId,
        }).returning({ id: transactions.id });

        await tx.update(importCandidates)
          .set({ createdTransactionId: inserted[0]!.id })
          .where(eq(importCandidates.id, candidate.id));

        imported++;
      } catch (error) {
        failed.push({
          candidateId: candidate.id,
          reason: error instanceof Error ? error.message : 'Insert failed',
        });
      }
    }

    await tx.update(imports).set({
      status: 'committed',
      importedCount: imported,
      committedAt: new Date(),
      errorCount: failed.length,
      errorDetail: failed.length > 0 ? `${failed.length} row(s) could not be written` : null,
    }).where(eq(imports.id, importId));
  });

  if (options.learnRules !== false) {
    await learnRulesFromImport(repo, importId);
  }

  await applyRetentionPolicy(repo, importId);

  return { imported, skipped, failed };
}

/**
 * Undo an entire import.
 *
 * Soft-deletes only the rows this import created — never anything the user entered
 * by hand, and never rows from a different import that happen to look similar.
 */
export async function rollbackImport(repo: WorkspaceRepo, importId: string): Promise<{ removed: number }> {
  const { userId, workspaceId } = repo;

  const rows = await withUser(userId, async (tx) => {
    const found = await tx.select({ id: imports.id, status: imports.status })
      .from(imports)
      .where(and(eq(imports.id, importId), eq(imports.workspaceId, workspaceId)))
      .limit(1);
    if (!found[0]) throw new Error('Import not found');
    if (found[0].status === 'rolled_back') throw new Error('This import has already been rolled back');

    const removed = await tx.update(transactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(transactions.workspaceId, workspaceId),
        eq(transactions.importId, importId),
        isNull(transactions.deletedAt),
      ))
      .returning({ id: transactions.id });

    await tx.update(imports).set({
      status: 'rolled_back',
      rolledBackAt: new Date(),
    }).where(eq(imports.id, importId));

    return removed.length;
  });

  return { removed: rows };
}

/**
 * Turn the user's corrections into visible rules (spec §4, §25).
 *
 * When someone re-categorises "SHELL #4021" during review, the next import should
 * already know. Storing that as a `merchant_rules` row rather than hidden model
 * state means they can see every inference and delete any of them.
 */
export async function learnRulesFromImport(repo: WorkspaceRepo, importId: string): Promise<number> {
  const { userId, workspaceId } = repo;

  const accepted = await withUser(userId, (tx) =>
    tx.select({
      merchantName: importCandidates.merchantName,
      categoryId: importCandidates.categoryId,
      businessClassification: importCandidates.businessClassification,
      rawExtraction: importCandidates.rawExtraction,
    }).from(importCandidates).where(and(
      eq(importCandidates.importId, importId),
      eq(importCandidates.workspaceId, workspaceId),
      eq(importCandidates.status, 'accepted'),
    )),
  );

  const existing = await repo.listMerchantRules();
  const known = new Set(existing.map((r) => r.pattern.toLowerCase()));

  const byMerchant = new Map<string, { categoryId: string; classification: string; count: number }>();
  for (const row of accepted) {
    if (!row.categoryId || !row.merchantName) continue;
    const pattern = normalizeMerchant(row.merchantName);
    if (!pattern || pattern.length < 3 || known.has(pattern)) continue;
    const entry = byMerchant.get(pattern);
    if (entry) {
      // Only learn a rule when the user was consistent about this merchant.
      if (entry.categoryId !== row.categoryId) entry.count = -1;
      else entry.count++;
    } else {
      byMerchant.set(pattern, {
        categoryId: row.categoryId,
        classification: row.businessClassification,
        count: 1,
      });
    }
  }

  const learned = [...byMerchant.entries()].filter(([, v]) => v.count >= 1);
  if (learned.length === 0) return 0;

  await withUser(userId, async (tx) => {
    for (const [pattern, value] of learned) {
      await tx.insert(merchantRules).values({
        workspaceId,
        matchType: 'contains',
        pattern,
        categoryId: value.categoryId,
        businessClassificationValue: value.classification as 'personal',
        priority: 200,
        source: 'learned',
      });
    }
  });

  return learned.length;
}

/** Honour the user's file-retention choice (spec §30). */
async function applyRetentionPolicy(repo: WorkspaceRepo, importId: string): Promise<void> {
  const { userId } = repo;

  const rows = await withUser(userId, (tx) =>
    tx.select({
      fileId: uploadedFiles.id,
      retention: uploadedFiles.retention,
      storageKey: uploadedFiles.storageKey,
    }).from(imports)
      .innerJoin(uploadedFiles, eq(uploadedFiles.id, imports.fileId))
      .where(eq(imports.id, importId))
      .limit(1),
  );

  const file = rows[0];
  if (!file || file.retention !== 'delete_after_extract') return;

  if (file.storageKey) await getStorage().delete(file.storageKey);
  await withUser(userId, (tx) =>
    tx.update(uploadedFiles)
      .set({ purgedAt: new Date(), storageKey: null })
      .where(eq(uploadedFiles.id, file.fileId)),
  );
}

function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}

function sourceFor(kind: string): 'csv' | 'xlsx' | 'pdf' | 'image' | 'video' | 'manual' {
  switch (kind) {
    case 'csv': return 'csv';
    case 'xlsx': return 'xlsx';
    case 'pdf': return 'pdf';
    case 'image': return 'image';
    case 'video_frames': return 'video';
    default: return 'manual';
  }
}

/** Bulk status changes from the review UI. */
export async function updateCandidates(
  repo: WorkspaceRepo,
  importId: string,
  updates: {
    id: string;
    status?: 'pending' | 'accepted' | 'rejected' | 'duplicate';
    categoryId?: string | null;
    accountId?: string | null;
    postedDate?: string;
    description?: string;
    merchantName?: string;
    amountMinor?: string;
    type?: TxnType;
    businessClassification?: 'personal' | 'business';
  }[],
): Promise<number> {
  const { userId, workspaceId } = repo;
  if (updates.length === 0) return 0;

  await withUser(userId, async (tx) => {
    for (const update of updates) {
      const { id, amountMinor, ...rest } = update;
      const values: Record<string, unknown> = { ...rest };
      if (amountMinor !== undefined) values.amountMinor = BigInt(amountMinor);
      if (Object.keys(values).length === 0) continue;

      await tx.update(importCandidates)
        .set(values)
        .where(and(
          eq(importCandidates.id, id),
          eq(importCandidates.importId, importId),
          eq(importCandidates.workspaceId, workspaceId),
        ));
    }
  });

  return updates.length;
}

export async function acceptAllConfident(
  repo: WorkspaceRepo,
  importId: string,
  floor: number,
): Promise<number> {
  const { userId, workspaceId } = repo;

  const rows = await withUser(userId, (tx) =>
    tx.select({ id: importCandidates.id, confidence: importCandidates.confidence, status: importCandidates.status })
      .from(importCandidates)
      .where(and(
        eq(importCandidates.importId, importId),
        eq(importCandidates.workspaceId, workspaceId),
        eq(importCandidates.status, 'pending'),
      )),
  );

  const eligible = rows.filter((r) => (r.confidence ?? 0) >= floor).map((r) => r.id);
  if (eligible.length === 0) return 0;

  await withUser(userId, (tx) =>
    tx.update(importCandidates)
      .set({ status: 'accepted' })
      .where(and(
        eq(importCandidates.workspaceId, workspaceId),
        inArray(importCandidates.id, eligible),
      )),
  );

  return eligible.length;
}

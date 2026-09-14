import 'server-only';
import Papa from 'papaparse';
import type { ExtractedTransaction } from '@/lib/ai/types';

export type SourceKind = 'csv' | 'xlsx' | 'pdf' | 'image' | 'video_frames' | 'text' | 'manual';

export interface ParsedSource {
  kind: SourceKind;
  /** Rows the parser resolved deterministically, if it could. */
  transactions: ExtractedTransaction[];
  /** Text handed to an AI provider when deterministic parsing is not possible. */
  text: string | null;
  /** Base64 images handed to a vision provider. */
  images: { data: string; mediaType: string; ref: string }[];
  columnMapping?: Record<string, string>;
  detectedHeaders?: string[];
  warnings: string[];
}

export function detectSourceKind(filename: string, mime: string): SourceKind {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ext === 'csv' || ext === 'tsv' || mime === 'text/csv') return 'csv';
  if (['xlsx', 'xls', 'xlsm'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) return 'xlsx';
  if (mime.startsWith('text/') || ext === 'txt') return 'text';
  if (mime.startsWith('video/')) return 'video_frames';
  return 'text';
}

/* ------------------------------------------------------------------ */
/* Column inference                                                    */
/* ------------------------------------------------------------------ */

/**
 * Every bank names its CSV columns differently. Rather than asking the user to map
 * them every time, infer from the header text and let them correct it in review.
 */
const COLUMN_PATTERNS: { field: string; patterns: RegExp[] }[] = [
  { field: 'date', patterns: [/^(transaction\s*)?date$/i, /^posted?(\s*date)?$/i, /^date\b/i, /booking/i] },
  { field: 'description', patterns: [/^description$/i, /^details?$/i, /^narrative$/i, /^memo$/i, /^transaction$/i, /^particulars$/i, /^name$/i] },
  { field: 'amount', patterns: [/^amount$/i, /^value$/i, /^transaction\s*amount$/i, /^amt$/i] },
  { field: 'debit', patterns: [/^debit$/i, /^withdrawals?$/i, /^money\s*out$/i, /^paid\s*out$/i, /^charges?$/i] },
  { field: 'credit', patterns: [/^credit$/i, /^deposits?$/i, /^money\s*in$/i, /^paid\s*in$/i, /^payments?$/i] },
  { field: 'balance', patterns: [/^balance$/i, /^running\s*balance$/i] },
  { field: 'merchant', patterns: [/^merchant$/i, /^payee$/i, /^vendor$/i, /^counterparty$/i] },
  { field: 'currency', patterns: [/^currency$/i, /^ccy$/i] },
  { field: 'category', patterns: [/^category$/i, /^type$/i] },
];

export function inferColumnMapping(headers: readonly string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const { field, patterns } of COLUMN_PATTERNS) {
    for (const header of headers) {
      if (used.has(header)) continue;
      const clean = header.trim();
      if (patterns.some((p) => p.test(clean))) {
        mapping[field] = header;
        used.add(header);
        break;
      }
    }
  }

  // Fall back to loose containment for a date column if nothing matched exactly.
  if (!mapping.date) {
    const loose = headers.find((h) => /date/i.test(h) && !used.has(h));
    if (loose) mapping.date = loose;
  }
  if (!mapping.description) {
    const loose = headers.find((h) => /desc|detail|memo|narrat/i.test(h) && !used.has(h));
    if (loose) mapping.description = loose;
  }

  return mapping;
}

/** Turn mapped rows into extracted transactions. */
export function rowsToTransactions(
  rows: readonly Record<string, string>[],
  mapping: Record<string, string>,
): { transactions: ExtractedTransaction[]; warnings: string[] } {
  const warnings: string[] = [];
  const transactions: ExtractedTransaction[] = [];

  if (!mapping.date) warnings.push('No date column was identified. Check the column mapping.');
  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    warnings.push('No amount column was identified. Check the column mapping.');
  }

  rows.forEach((row, index) => {
    const dateRaw = mapping.date ? (row[mapping.date] ?? '').trim() : '';
    if (!dateRaw) return;

    let amountRaw = '';
    let direction: 'debit' | 'credit' | null = null;

    if (mapping.amount && (row[mapping.amount] ?? '').trim()) {
      amountRaw = row[mapping.amount]!.trim();
    } else {
      // Separate debit/credit columns: exactly one is populated per row.
      const debit = mapping.debit ? (row[mapping.debit] ?? '').trim() : '';
      const credit = mapping.credit ? (row[mapping.credit] ?? '').trim() : '';
      if (debit && debit !== '0' && debit !== '0.00') {
        amountRaw = debit;
        direction = 'debit';
      } else if (credit && credit !== '0' && credit !== '0.00') {
        amountRaw = credit;
        direction = 'credit';
      }
    }
    if (!amountRaw) return;

    const description = mapping.description ? (row[mapping.description] ?? '').trim() : '';
    const merchant = mapping.merchant ? (row[mapping.merchant] ?? '').trim() : '';

    transactions.push({
      date: dateRaw,
      description: description || merchant || 'Imported transaction',
      merchant: merchant || null,
      amount: amountRaw,
      currency: mapping.currency ? (row[mapping.currency] ?? '').trim().toUpperCase() || null : null,
      direction,
      confidence: { date: 95, description: description ? 95 : 40, amount: 95 },
      sourceRef: `row ${index + 2}`,
    });
  });

  return { transactions, warnings };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export function parseCsv(content: string): ParsedSource {
  // Some exports prefix a title block before the real header row; find it.
  const cleaned = stripPreamble(content);

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    dynamicTyping: false,
  });

  const headers = result.meta.fields ?? [];
  const mapping = inferColumnMapping(headers);
  const { transactions, warnings } = rowsToTransactions(result.data, mapping);

  if (result.errors.length > 0) {
    warnings.push(`${result.errors.length} row${result.errors.length === 1 ? '' : 's'} could not be read and were skipped.`);
  }

  return {
    kind: 'csv',
    transactions,
    text: transactions.length === 0 ? cleaned.slice(0, 100_000) : null,
    images: [],
    columnMapping: mapping,
    detectedHeaders: headers,
    warnings,
  };
}

/** Skip title/metadata lines so the header row is found correctly. */
function stripPreamble(content: string): string {
  const lines = content.split(/\r?\n/);
  const delimiter = (content.match(/\t/g)?.length ?? 0) > (content.match(/,/g)?.length ?? 0) ? '\t' : ',';

  let best = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const cells = lines[i]!.split(delimiter);
    if (cells.length < 2) continue;
    const mapping = inferColumnMapping(cells.map((c) => c.trim().replace(/^"|"$/g, '')));
    const score = Object.keys(mapping).length;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 2 ? lines.slice(best).join('\n') : content;
}

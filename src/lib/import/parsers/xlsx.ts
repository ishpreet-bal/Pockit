import 'server-only';
import ExcelJS from 'exceljs';
import type { ParsedSource } from './index';
import { inferColumnMapping, rowsToTransactions } from './index';

/**
 * Excel parsing via ExcelJS.
 *
 * ExcelJS rather than the `xlsx` package on npm: that package's last npm release
 * carries unpatched prototype-pollution and ReDoS advisories, and this parser runs
 * on files the user downloaded from elsewhere.
 */
export async function parseXlsx(buffer: Buffer): Promise<ParsedSource> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const warnings: string[] = [];
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { kind: 'xlsx', transactions: [], text: null, images: [], warnings: ['The workbook has no sheets.'] };
  }
  if (workbook.worksheets.length > 1) {
    warnings.push(`Only the first sheet ("${sheet.name}") was read; the workbook has ${workbook.worksheets.length} sheets.`);
  }

  // Read every row as strings so no value is coerced before lib/money sees it.
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellToString(cell);
    });
    grid.push(cells);
  });

  if (grid.length < 2) {
    return { kind: 'xlsx', transactions: [], text: null, images: [], warnings: [...warnings, 'The sheet has no data rows.'] };
  }

  // Find the header row the same way the CSV parser does.
  let headerIndex = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const score = Object.keys(inferColumnMapping((grid[i] ?? []).map((c) => c ?? ''))).length;
    if (score > bestScore) { bestScore = score; headerIndex = i; }
  }

  const headers = (grid[headerIndex] ?? []).map((h, i) => (h?.trim() ? h.trim() : `Column ${i + 1}`));
  const mapping = inferColumnMapping(headers);

  const rows = grid.slice(headerIndex + 1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => { record[h] = cells[i] ?? ''; });
    return record;
  });

  const { transactions, warnings: rowWarnings } = rowsToTransactions(rows, mapping);

  return {
    kind: 'xlsx',
    transactions,
    text: null,
    images: [],
    columnMapping: mapping,
    detectedHeaders: headers,
    warnings: [...warnings, ...rowWarnings],
  };
}

/** Excel dates arrive as Date objects; everything else becomes its display text. */
function cellToString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return String((value as { result: unknown }).result ?? '');
    if ('richText' in value) {
      return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
    }
    return '';
  }
  return String(value);
}

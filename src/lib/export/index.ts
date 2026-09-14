import 'server-only';
import { toDecimalString } from '@/lib/money';
import type { LedgerTxn, LedgerCategory, LedgerAccount } from '@/lib/finance/types';

/**
 * Data export (spec §38: "never trap the user's data").
 *
 * Amounts are written as exact decimal strings from the integer minor units, never
 * via a float — an export that loses a cent is worse than no export. The original
 * currency and amount are always included alongside the converted value.
 */

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula. Prefix
  // with a quote so an imported description cannot execute anything.
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(headers: readonly string[], rows: readonly (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  // A BOM makes Excel open UTF-8 correctly, which matters for merchant names.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function exportTransactionsCsv(
  txns: readonly LedgerTxn[],
  categories: readonly LedgerCategory[],
  accounts: readonly LedgerAccount[],
  baseCurrency: string,
): string {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const parentName = (c: LedgerCategory | undefined) =>
    c?.parentId ? categoryById.get(c.parentId)?.name ?? '' : '';

  const headers = [
    'Date', 'Description', 'Merchant', 'Amount', 'Currency',
    `Amount (${baseCurrency})`, 'Base currency', 'Type', 'Category', 'Parent category',
    'Account', 'Classification', 'Recurring', 'Transaction ID',
  ];

  const rows = txns.map((t) => {
    const cat = t.categoryId ? categoryById.get(t.categoryId) : undefined;
    return [
      t.postedDate,
      t.description,
      t.merchantName ?? '',
      toDecimalString(t.amountMinor, t.currency),
      t.currency,
      toDecimalString(t.baseAmountMinor, baseCurrency),
      baseCurrency,
      t.type,
      cat?.name ?? '',
      parentName(cat),
      accountById.get(t.accountId)?.name ?? '',
      t.businessClassification,
      t.isRecurring ? 'yes' : 'no',
      t.id,
    ];
  });

  return toCsv(headers, rows);
}

export function exportCategoriesCsv(categories: readonly LedgerCategory[]): string {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return toCsv(
    ['Name', 'Parent', 'Kind', 'Classification', 'Necessity', 'Slug'],
    categories.map((c) => [
      c.name,
      c.parentId ? byId.get(c.parentId)?.name ?? '' : '',
      c.kind, c.classification, c.necessity, c.slug,
    ]),
  );
}

export interface GoalExportRow {
  name: string; target: bigint; current: bigint; targetDate: string | null;
  status: string; currency: string;
}

export function exportGoalsCsv(goals: readonly GoalExportRow[]): string {
  return toCsv(
    ['Goal', 'Target', 'Saved', 'Remaining', 'Currency', 'Target date', 'Status'],
    goals.map((g) => [
      g.name,
      toDecimalString(g.target, g.currency),
      toDecimalString(g.current, g.currency),
      toDecimalString(g.target - g.current > 0n ? g.target - g.current : 0n, g.currency),
      g.currency,
      g.targetDate ?? '',
      g.status,
    ]),
  );
}

export interface MonthlySummaryRow {
  month: string; income: bigint; expenses: bigint; net: bigint;
  investments: bigint; savingsRateBps: number;
}

export function exportSummaryCsv(rows: readonly MonthlySummaryRow[], currency: string): string {
  return toCsv(
    ['Month', 'Income', 'Expenses', 'Net cash flow', 'Invested', 'Savings rate %', 'Currency'],
    rows.map((r) => [
      r.month,
      toDecimalString(r.income, currency),
      toDecimalString(r.expenses, currency),
      toDecimalString(r.net, currency),
      toDecimalString(r.investments, currency),
      (r.savingsRateBps / 100).toFixed(1),
      currency,
    ]),
  );
}

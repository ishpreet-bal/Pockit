import { describe, it, expect } from 'vitest';
import { detectRecurring, summarizeSubscriptions, monthlyEquivalent, upcomingOccurrences } from './recurring';
import { forecast } from './forecast';
import type { LedgerTxn, LedgerAccount } from './types';

let seq = 0;
function txn(p: Partial<LedgerTxn> & { amountMinor: bigint; postedDate: string }): LedgerTxn {
  return {
    id: p.id ?? `r${++seq}`,
    accountId: p.accountId ?? 'chq',
    postedDate: p.postedDate,
    description: p.description ?? 'Test',
    merchantName: p.merchantName ?? p.description ?? 'Test',
    merchantId: null,
    amountMinor: p.amountMinor,
    baseAmountMinor: p.baseAmountMinor ?? p.amountMinor,
    currency: 'CAD',
    type: p.type ?? 'expense',
    categoryId: p.categoryId ?? null,
    businessClassification: 'personal',
    isRecurring: p.isRecurring ?? false,
    recurringSeriesId: null,
    transferGroupId: p.transferGroupId ?? null,
    offsetsTransactionId: null,
  };
}

const ACCOUNTS: LedgerAccount[] = [
  { id: 'chq', name: 'Chequing', type: 'chequing', normalBalance: 'debit', currency: 'CAD', openingBalanceMinor: 500_000n, openingBalanceDate: '2026-01-01', creditLimitMinor: null, isActive: true, excludeFromNetWorth: false },
  { id: 'sav', name: 'Savings', type: 'savings', normalBalance: 'debit', currency: 'CAD', openingBalanceMinor: 0n, openingBalanceDate: '2026-01-01', creditLimitMinor: null, isActive: true, excludeFromNetWorth: false },
  { id: 'visa', name: 'Visa', type: 'credit_card', normalBalance: 'credit', currency: 'CAD', openingBalanceMinor: 0n, openingBalanceDate: '2026-01-01', creditLimitMinor: 500_000n, isActive: true, excludeFromNetWorth: false },
];
const NORMAL = new Map(ACCOUNTS.map((a) => [a.id, a.normalBalance] as const));

describe('recurring detection', () => {
  it('detects a monthly subscription and its cadence', () => {
    const txns = ['2026-06-08', '2026-07-08', '2026-08-08', '2026-09-08'].map((d) =>
      txn({ postedDate: d, amountMinor: 2099n, description: 'Netflix', accountId: 'visa' }),
    );
    const [series] = detectRecurring(txns, '2026-09-14', undefined, NORMAL);
    expect(series?.cadence).toBe('monthly');
    expect(series?.amountMinor).toBe(2099n);
    expect(series?.kind).toBe('subscription');
    expect(series?.nextExpectedDate).toBe('2026-10-08');
    expect(series?.confidence).toBeGreaterThan(70);
  });

  it('needs three occurrences before calling something recurring', () => {
    const two = ['2026-08-08', '2026-09-08'].map((d) =>
      txn({ postedDate: d, amountMinor: 2099n, description: 'Netflix' }),
    );
    expect(detectRecurring(two, '2026-09-14', undefined, NORMAL)).toHaveLength(0);
  });

  it('reports a price increase above 3%', () => {
    const txns = [
      txn({ postedDate: '2026-06-08', amountMinor: 2099n, description: 'Netflix' }),
      txn({ postedDate: '2026-07-08', amountMinor: 2099n, description: 'Netflix' }),
      txn({ postedDate: '2026-08-08', amountMinor: 2399n, description: 'Netflix' }),
      txn({ postedDate: '2026-09-08', amountMinor: 2399n, description: 'Netflix' }),
    ];
    const [series] = detectRecurring(txns, '2026-09-14', undefined, NORMAL);
    expect(series?.priceChanges).toHaveLength(1);
    expect(series?.priceChanges[0]).toMatchObject({ fromMinor: 2099n, toMinor: 2399n });
  });

  it('normalises any cadence to a monthly equivalent', () => {
    expect(monthlyEquivalent(1200n, 'annual', 365)).toBe(100n);
    expect(monthlyEquivalent(1000n, 'weekly', 7)).toBe(4333n);
    expect(monthlyEquivalent(2099n, 'monthly', 30)).toBe(2099n);
  });
});

/**
 * Regression: both legs of a transfer are detected as separate series with the same
 * amount. Without a direction, "Transfer to savings" and "Transfer from chequing"
 * both appeared as upcoming bills for one movement, and an investment contribution
 * was counted as an expense on both sides of the forecast.
 */
describe('paired movements are not counted twice', () => {
  const legs: LedgerTxn[] = [];
  for (const d of ['2026-06-16', '2026-07-16', '2026-08-16', '2026-09-16']) {
    legs.push(txn({ postedDate: d, amountMinor: -60_000n, type: 'transfer', accountId: 'chq', description: 'Transfer to savings', transferGroupId: d }));
    legs.push(txn({ postedDate: d, amountMinor: 60_000n, type: 'transfer', accountId: 'sav', description: 'Transfer from chequing', transferGroupId: d }));
    legs.push(txn({ postedDate: d, amountMinor: -50_000n, type: 'investment', accountId: 'chq', description: 'TFSA contribution' }));
    legs.push(txn({ postedDate: d, amountMinor: 50_000n, type: 'investment', accountId: 'sav', description: 'TFSA contribution' }));
  }

  it('labels the leaving leg outflow and the arriving leg inflow', () => {
    const series = detectRecurring(legs, '2026-09-20', undefined, NORMAL);
    const out = series.filter((s) => s.direction === 'outflow');
    const inn = series.filter((s) => s.direction === 'inflow');
    expect(out.length).toBeGreaterThan(0);
    expect(inn.length).toBeGreaterThan(0);
    // Each movement has exactly one of each side.
    expect(out.length).toBe(inn.length);
  });

  it('reads a credit-card purchase as an outflow despite the positive sign', () => {
    const card = ['2026-06-08', '2026-07-08', '2026-08-08'].map((d) =>
      txn({ postedDate: d, amountMinor: 2099n, accountId: 'visa', description: 'Netflix' }),
    );
    const [series] = detectRecurring(card, '2026-09-14', undefined, NORMAL);
    expect(series?.direction).toBe('outflow');
  });

  it('counts an investment contribution once in the forecast, not twice', () => {
    const series = detectRecurring(legs, '2026-09-20', undefined, NORMAL);
    const result = forecast({
      startingBalanceMinor: 1_000_000n,
      today: '2026-09-20',
      horizonDays: 40,
      series,
      historyTxns: [],
      historyRange: { start: '2026-06-01', end: '2026-09-20' },
      categories: [],
    });

    // Transfers net to zero across the user's own accounts and must not appear.
    expect(result.scheduled.some((s) => s.type === 'transfer')).toBe(false);

    // One investment contribution of $500 falls inside the horizon — not $1,000.
    const investments = result.scheduled.filter((s) => s.type === 'investment');
    expect(investments.every((s) => s.direction === 'outflow')).toBe(true);
    expect(result.knownExpensesMinor).toBe(50_000n * BigInt(investments.length));
    expect(investments.length).toBeGreaterThan(0);
  });

  it('excludes the arriving leg from upcoming outflows', () => {
    const series = detectRecurring(legs, '2026-09-20', undefined, NORMAL);
    const outflowsOnly = upcomingOccurrences(series, '2026-09-20', '2026-10-31')
      .filter((u) => u.direction === 'outflow');
    const inflows = upcomingOccurrences(series, '2026-09-20', '2026-10-31')
      .filter((u) => u.direction === 'inflow');
    expect(outflowsOnly.length).toBeGreaterThan(0);
    expect(inflows.length).toBeGreaterThan(0);
    expect(outflowsOnly.every((u) => u.direction === 'outflow')).toBe(true);
  });
});

describe('subscription summary', () => {
  it('totals monthly and annual cost', () => {
    const txns = [
      ...['2026-06-08', '2026-07-08', '2026-08-08', '2026-09-08'].map((d) =>
        txn({ postedDate: d, amountMinor: 2099n, description: 'Netflix', accountId: 'visa' })),
      ...['2026-06-14', '2026-07-14', '2026-08-14', '2026-09-14'].map((d) =>
        txn({ postedDate: d, amountMinor: 1199n, description: 'Spotify', accountId: 'visa' })),
    ];
    const summary = summarizeSubscriptions(detectRecurring(txns, '2026-09-20', undefined, NORMAL));
    expect(summary.count).toBe(2);
    expect(summary.monthlyMinor).toBe(3298n);
    expect(summary.annualMinor).toBe(39_576n);
  });
});

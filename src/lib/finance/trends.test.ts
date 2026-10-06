import { describe, expect, it } from 'vitest';
import { computeTrends } from './trends';
import type { LedgerCategory, LedgerTxn } from './types';

const cats = [
  { id: 'food', parentId: null, name: 'Eating out', kind: 'expense' },
  { id: 'gro', parentId: null, name: 'Groceries', kind: 'expense' },
] as unknown as LedgerCategory[];
const tx = (date: string, cat: string, dollars: number): LedgerTxn => ({
  id: `${date}-${cat}-${dollars}`, accountId: 'a', postedDate: date, description: 'x', amountMinor: BigInt(-dollars * 100),
  baseAmountMinor: BigInt(-dollars * 100), currency: 'CAD', type: 'expense', categoryId: cat,
} as unknown as LedgerTxn);

describe('trends', () => {
  const txns = [
    tx('2026-07-10', 'food', 200), tx('2026-08-10', 'food', 200), tx('2026-09-10', 'food', 200), tx('2026-10-05', 'food', 150), tx('2026-10-14', 'food', 100),
    tx('2026-07-10', 'gro', 500), tx('2026-08-10', 'gro', 500), tx('2026-09-10', 'gro', 500), tx('2026-10-05', 'gro', 250),
  ];
  it('totals each category per month', () => {
    const t = computeTrends(txns, cats, { start: '2026-07-01', end: '2026-10-31' }, '2026-10-15');
    expect(t.months).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(t.categories.find((c) => c.name === 'Eating out')!.months).toEqual([20000, 20000, 20000, 25000]);
    expect(t.totals[0]).toBe(70000);
  });
  it('says what changed, projected over the whole month', () => {
    const t = computeTrends(txns, cats, { start: '2026-07-01', end: '2026-10-31' }, '2026-10-15');
    // $250 by the 15th of a 31-day month ≈ $517 projected vs a usual $200
    expect(t.notes[0]).toMatchObject({ kind: 'up', category: 'Eating out' });
    expect(t.notes[0]!.amountMinor).toBeGreaterThan(25000);
  });
  it('stays quiet early in the month', () => {
    const t = computeTrends(txns, cats, { start: '2026-07-01', end: '2026-10-31' }, '2026-10-03');
    expect(t.notes).toEqual([]);
  });
});

describe('budget rollover and payday periods', () => {
  it('carries last month’s leftover into this month, capped, and never carries overspending', async () => {
    const { evaluateBudget } = await import('./budget');
    const budget = { id: 'b', name: 'x', method: 'category', period: 'monthly', periodStart: '2026-09-01', periodDays: null, expectedIncomeMinor: null, rollover: true,
      allocations: [
        { id: '1', categoryId: 'gro', bucket: null, label: null, amountMinor: 50000n, percentBps: null },
        { id: '2', categoryId: 'food', bucket: null, label: null, amountMinor: 20000n, percentBps: null },
      ] } as never;
    const history = [tx('2026-09-10', 'gro', 400), tx('2026-09-12', 'food', 260), tx('2026-10-05', 'gro', 100)];
    const s = evaluateBudget(budget, history, cats, '2026-10-15', undefined, history);
    const gro = s.lines.find((l) => l.categoryId === 'gro')!;
    const food = s.lines.find((l) => l.categoryId === 'food')!;
    expect(gro.carriedMinor).toBe(10000n);   // $100 unused in September
    expect(gro.targetMinor).toBe(60000n);    // $500 + $100
    expect(food.carriedMinor).toBe(0n);      // overspent in September: fresh start, no debt
    const noHistory = evaluateBudget(budget, history, cats, '2026-10-15');
    expect(noHistory.lines.find((l) => l.categoryId === 'gro')!.carriedMinor).toBe(0n);
  });

  it('a biweekly payday budget runs on its own dates', async () => {
    const { currentBudgetPeriod } = await import('./budget');
    const p = currentBudgetPeriod({ period: 'biweekly', periodStart: '2026-09-25', periodDays: null } as never, '2026-10-15');
    expect(p).toEqual({ start: '2026-10-09', end: '2026-10-22' });
  });
});

describe('splitting a shared space', () => {
  it('two people: the one who paid less pays the difference', async () => {
    const { splitEvenly } = await import('./split');
    const r = splitEvenly([{ id: 'a', name: 'Ish' }, { id: 'b', name: 'Sam' }], new Map([['a', 30000], ['b', 10000]]));
    expect(r.shareMinor).toBe(20000);
    expect(r.settle).toEqual([{ from: 'Sam', to: 'Ish', amountMinor: 10000 }]);
  });
  it('three people, one paid nothing', async () => {
    const { splitEvenly } = await import('./split');
    const r = splitEvenly([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], new Map([['a', 60000], ['b', 30000]]));
    expect(r.settle).toEqual([{ from: 'C', to: 'A', amountMinor: 30000 }]);
  });
  it('even spending means nobody owes anything', async () => {
    const { splitEvenly } = await import('./split');
    expect(splitEvenly([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], new Map([['a', 5000], ['b', 5000]])).settle).toEqual([]);
  });
});

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

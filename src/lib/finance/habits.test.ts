import { describe, expect, it } from 'vitest';
import { everydayPerDay, findHabits } from './habits';
import type { LedgerTxn } from './types';

let n = 0;
const t = (date: string, minor: number, name: string, categoryId: string | null = null, type: LedgerTxn['type'] = 'expense'): LedgerTxn => ({
  id: `h${++n}`, accountId: 'visa', postedDate: date, description: name, merchantName: name, merchantId: null,
  amountMinor: BigInt(minor), baseAmountMinor: BigInt(-minor), currency: 'CAD', type, categoryId,
  businessClassification: 'personal', isRecurring: false, recurringSeriesId: null, transferGroupId: null, offsetsTransactionId: null,
});
const TODAY = '2026-11-12';
const back = (d: number) => { const x = new Date(`${TODAY}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - d); return x.toISOString().slice(0, 10); };
const isWeekday = (iso: string) => { const w = new Date(`${iso}T12:00:00Z`).getUTCDay(); return w >= 1 && w <= 5; };

const txns: LedgerTxn[] = [
  ...Array.from({ length: 56 }, (_, i) => back(i)).filter(isWeekday).map((d, i) => t(d, 600 + (i % 3) * 50, 'Magna Electronics Cafeteria', 'c-rest')),
  ...Array.from({ length: 8 }, (_, i) => t(back(i * 7 + 2), 5000 + (i % 2) * 800, 'Circle K', 'c-gas')),
  ...[3, 17, 31, 45].map((d) => t(back(d), 8500, 'Rogers', 'c-phone')),
  t(back(10), 30000, 'Best Buy', 'c-elec'),
];
const bills = new Set(txns.filter((x) => x.description === 'Rogers').map((x) => x.id));

describe('habits', () => {
  const r = findHabits(txns, TODAY, { exclude: bills });
  const byName = Object.fromEntries(r.habits.map((h) => [h.name, h]));
  it('breakfast at work, every weekday, with its weekly cost', () => {
    const b = byName['Magna Electronics Cafeteria']!;
    expect(b.rhythm).toBe('every weekday');
    // About $6.50 × 5 days.
    expect(Number(b.perWeekMinor)).toBeGreaterThan(3000);
    expect(Number(b.perWeekMinor)).toBeLessThan(3500);
  });
  it('gas, about once a week', () => {
    expect(byName['Circle K']!.rhythm).toBe('about once a week');
    expect(Number(byName['Circle K']!.perWeekMinor)).toBeGreaterThan(5000);
  });
  it('a bill is not a habit, and a one-off is not either', () => {
    expect(byName.Rogers).toBeUndefined();
    expect(byName['Best Buy']).toBeUndefined();
  });
  it('the biggest weekly spend comes first', () => {
    expect(r.habits[0]!.name).toBe('Circle K');
  });
  it('per-week by category includes bills and one-offs (it is everything spent)', () => {
    expect(r.categories.find((c) => c.categoryId === 'c-gas')).toBeTruthy();
  });
});

describe('everyday pace for projections', () => {
  it('leaves bills out, since they are projected on their own dates', () => {
    const withBills = everydayPerDay(txns, TODAY, new Set());
    const without = everydayPerDay(txns, TODAY, bills);
    // Four $85 phone bills over 56 days is about $6 a day the pace must not include.
    expect(Number(withBills - without)).toBeGreaterThanOrEqual(600);
    expect(Number(withBills - without)).toBeLessThanOrEqual(608);
  });
});

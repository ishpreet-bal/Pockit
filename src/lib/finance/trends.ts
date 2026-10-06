import { rollUpCategories, spendingByCategory } from './ledger';
import { monthKey, monthsInRange } from './period';
import type { DateRange, LedgerCategory, LedgerTxn } from './types';

/**
 * Spending by category, month by month — and the two or three changes worth
 * saying out loud. "Eating out is up $90 on your usual" beats a chart nobody reads.
 *
 * The current month is compared with the average of the months before it, and
 * only once it's at least a third of the way through, so day 2 never claims
 * you've "cut groceries by 90%".
 */

export interface Trends {
  months: string[]; // 'YYYY-MM', oldest first
  totals: number[]; // all spending per month, minor units
  categories: { id: string; name: string; months: number[] }[];
  notes: { kind: 'up' | 'down'; category: string; amountMinor: number; text: string }[];
}

export function computeTrends(txns: readonly LedgerTxn[], cats: readonly LedgerCategory[], range: DateRange, today: string): Trends {
  const months = monthsInRange(range);
  const top = cats.filter((c) => c.parentId === null && c.kind === 'expense');
  const per = months.map((m) => {
    const inMonth = txns.filter((t) => t.postedDate >= m.start && t.postedDate <= m.end);
    return rollUpCategories(spendingByCategory(inMonth), cats);
  });
  const categories = top
    .map((c) => ({ id: c.id, name: c.name, months: per.map((p) => Number(p.get(c.id) ?? 0n)) }))
    .filter((c) => c.months.some((v) => v > 0))
    .sort((a, b) => b.months[b.months.length - 1]! - a.months[a.months.length - 1]! || sum(b.months) - sum(a.months));
  const totals = months.map((_, i) => categories.reduce((s, c) => s + c.months[i]!, 0));

  const notes: Trends['notes'] = [];
  const last = months[months.length - 1];
  if (last && months.length >= 3) {
    const daysIn = dayDiff(last.start, last.end) + 1;
    const elapsed = Math.min(daysIn, dayDiff(last.start, today) + 1);
    if (elapsed / daysIn >= 1 / 3) {
      const scale = daysIn / elapsed; // project the month so far onto the whole month
      const changes = categories.map((c) => {
        const before = c.months.slice(0, -1).filter((_, i, arr) => i >= arr.length - 3);
        const usual = before.length ? sum(before) / before.length : 0;
        const projected = c.months[c.months.length - 1]! * scale;
        return { c, usual, delta: projected - usual };
      }).filter((x) => x.usual > 5_000 && Math.abs(x.delta) >= Math.max(3_000, x.usual * 0.2));
      changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      for (const x of changes.slice(0, 3)) {
        const amt = Math.round(Math.abs(x.delta) / 100) * 100;
        notes.push({
          kind: x.delta > 0 ? 'up' : 'down', category: x.c.name, amountMinor: amt,
          text: x.delta > 0
            ? `${x.c.name} is on track to be about $${(amt / 100).toFixed(0)} more than your usual month.`
            : `${x.c.name} is about $${(amt / 100).toFixed(0)} under your usual — nice.`,
        });
      }
    }
  }
  return { months: months.map((m) => monthKey(m.start)), totals, categories, notes };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

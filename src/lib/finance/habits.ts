/**
 * Habits: the everyday spending that isn't a bill but happens all the time
 * (breakfast at work, gas every week, a coffee most mornings). Pure, tested.
 *
 * A bill is due on a date; a habit is a pace. Knowing the pace is what makes a
 * projection honest ("at this rate, $X by the 30th") and what people actually want
 * to see: "$41 a week on breakfast at work".
 */
import { normalizeMerchant } from './duplicates';
import { spendingAmount } from './ledger';
import { addDays, diffDays } from './period';
import type { IsoDate, LedgerTxn } from './types';

export interface Habit {
  key: string;
  name: string;
  categoryId: string | null;
  visits: number;
  /** Average spent per week over the window. */
  perWeekMinor: bigint;
  /** A usual visit (the median). */
  typicalMinor: bigint;
  /** How often, in words the app can show. */
  rhythm: 'every weekday' | 'most days' | 'a few times a week' | 'about once a week' | 'every couple of weeks';
  lastDate: IsoDate;
}

export interface CategoryPace { categoryId: string; perWeekMinor: bigint }

export interface HabitsResult {
  habits: Habit[];
  /** Spending per week by category over the same window, biggest first. */
  categories: CategoryPace[];
  windowDays: number;
}

const median = (xs: bigint[]) => { const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); return s[Math.floor(s.length / 2)] ?? 0n; };
const weekday = (iso: IsoDate) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/**
 * `exclude` holds transactions already explained as bills (recurring series), so a
 * phone bill is never also a "habit".
 */
export function findHabits(txns: readonly LedgerTxn[], today: IsoDate, opts: { weeks?: number; exclude?: ReadonlySet<string> } = {}): HabitsResult {
  const weeks = opts.weeks ?? 8;
  const posted = txns.filter((t) => t.postedDate <= today);
  const earliest = posted.reduce<IsoDate | null>((m, t) => (!m || t.postedDate < m ? t.postedDate : m), null);
  // Shorter than the window when there isn't that much history yet: a week of data
  // is a week, not an eighth of eight weeks.
  const windowDays = earliest ? Math.max(7, Math.min(weeks * 7, diffDays(earliest, today) + 1)) : weeks * 7;
  const from = addDays(today, -(windowDays - 1));
  const perWeek = (total: bigint) => (total * 7n) / BigInt(windowDays);

  const groups = new Map<string, LedgerTxn[]>();
  const byCategory = new Map<string, bigint>();
  for (const t of posted) {
    if (t.postedDate < from || t.type !== 'expense') continue;
    const spent = spendingAmount(t);
    if (spent <= 0n) continue;
    if (t.categoryId) byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0n) + spent);
    if (opts.exclude?.has(t.id)) continue;
    const key = normalizeMerchant(t.merchantName ?? t.description);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(t); else groups.set(key, [t]);
  }

  const habits: Habit[] = [];
  for (const [key, list] of groups) {
    const days = new Set(list.map((t) => t.postedDate));
    // A habit repeats: at least four separate days, across at least two different weeks.
    if (days.size < 4) continue;
    const weeksSeen = new Set(list.map((t) => Math.floor(diffDays(from, t.postedDate) / 7)));
    if (weeksSeen.size < 2) continue;
    const amounts = list.map((t) => spendingAmount(t));
    const total = amounts.reduce((s, a) => s + a, 0n);
    const visitsPerWeek = (days.size * 7) / windowDays;
    const weekdayShare = [...days].filter((d) => { const w = weekday(d); return w >= 1 && w <= 5; }).length / days.size;
    const rhythm: Habit['rhythm'] =
      visitsPerWeek >= 3.5 && weekdayShare >= 0.9 ? 'every weekday'
      : visitsPerWeek >= 4 ? 'most days'
      : visitsPerWeek >= 1.6 ? 'a few times a week'
      : visitsPerWeek >= 0.75 ? 'about once a week'
      : 'every couple of weeks';
    const last = list.reduce((m, t) => (t.postedDate > m.postedDate ? t : m), list[0]!);
    habits.push({
      key, name: (last.merchantName ?? last.description).trim(), categoryId: last.categoryId,
      visits: days.size, perWeekMinor: perWeek(total), typicalMinor: median(amounts), rhythm, lastDate: last.postedDate,
    });
  }

  habits.sort((a, b) => (b.perWeekMinor > a.perWeekMinor ? 1 : b.perWeekMinor < a.perWeekMinor ? -1 : 0));
  const categories = [...byCategory.entries()]
    .map(([categoryId, total]) => ({ categoryId, perWeekMinor: perWeek(total) }))
    .sort((a, b) => (b.perWeekMinor > a.perWeekMinor ? 1 : -1));
  return { habits, categories, windowDays };
}

/**
 * Everyday spending per day, for projections: everything spent in the window that
 * isn't already a scheduled bill (those are projected on their own dates).
 */
export function everydayPerDay(
  txns: readonly LedgerTxn[], today: IsoDate, exclude: ReadonlySet<string>,
  opts: { days?: number; billCategoryIds?: ReadonlySet<string>; oneOffMinor?: bigint } = {},
): bigint {
  const days = opts.days ?? 56;
  // A single purchase this big is a one-off (a laptop, a flight), not a pace to repeat.
  const oneOff = opts.oneOffMinor ?? 40_000n;
  const posted = txns.filter((t) => t.postedDate <= today);
  const earliest = posted.reduce<IsoDate | null>((m, t) => (!m || t.postedDate < m ? t.postedDate : m), null);
  const window = earliest ? Math.max(7, Math.min(days, diffDays(earliest, today) + 1)) : days;
  const from = addDays(today, -(window - 1));
  let total = 0n;
  for (const t of posted) {
    if (t.postedDate < from || exclude.has(t.id)) continue;
    // Rent, hydro, phone and the like are bills even before they've repeated enough
    // to be detected: they come on a date, not at a daily rate.
    if (t.categoryId && opts.billCategoryIds?.has(t.categoryId)) continue;
    const spent = spendingAmount(t);
    if (spent > 0n && spent < oneOff) total += spent;
  }
  return total / BigInt(window);
}

/** Categories that are paid as bills, never at an everyday pace. */
export const BILL_SLUGS = new Set(['housing', 'rent', 'bills', 'utilities', 'phone', 'internet', 'insurance', 'car-insurance', 'debt-payments', 'education', 'subscriptions']);

/**
 * Manually created recurring items.
 *
 * Detection from history and manual entry are two SEPARATE systems, deliberately.
 * Detection needs months of data to find a pattern; telling a brand-new user to
 * "import more history" before they can record that rent is due on the 1st is a dead
 * end. Manual schedules work from the moment the user types them in, and feed the
 * same projections, budgets, calendar and cash-flow figures as detected ones.
 */
import { absMinor } from '@/lib/money';
import type { IsoDate, TxnType } from './types';
import { addDays, addMonths, daysInMonth } from './period';
import type { Cadence, DetectedSeries } from './recurring';

export interface ManualSchedule {
  id: string;
  name: string;
  amountMinor: bigint;
  currency: string;
  cadence: Cadence;
  /** For 'custom': repeat every N days. For monthly variants: every N months. */
  interval: number;
  /** 1-31 for monthly cadences. 31 means "last day of the month". */
  dayOfMonth: number | null;
  /** The first occurrence. Everything is projected forward from here. */
  startDate: IsoDate;
  endDate: IsoDate | null;
  type: TxnType;
  categoryId: string | null;
  accountId: string | null;
  direction: 'outflow' | 'inflow';
  isActive: boolean;
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  annual: 'Every year',
  custom: 'Custom',
};

/**
 * Project the dates a schedule falls on within a window.
 *
 * Month-end is handled explicitly: a bill due on the 31st falls on the 28th in
 * February rather than silently skipping the month or spilling into March.
 */
export function occurrencesBetween(
  schedule: Pick<ManualSchedule, 'cadence' | 'interval' | 'dayOfMonth' | 'startDate' | 'endDate'>,
  from: IsoDate,
  to: IsoDate,
  limit = 400,
): IsoDate[] {
  const out: IsoDate[] = [];
  if (to < from) return out;

  const { cadence, startDate, endDate } = schedule;
  const interval = Math.max(1, schedule.interval || 1);
  const hardEnd = endDate && endDate < to ? endDate : to;

  if (cadence === 'monthly' || cadence === 'quarterly' || cadence === 'annual') {
    const step = cadence === 'monthly' ? interval : cadence === 'quarterly' ? 3 * interval : 12 * interval;
    const targetDay = schedule.dayOfMonth ?? Number(startDate.slice(8, 10));

    let cursor = startDate;
    let guard = 0;
    while (cursor <= hardEnd && guard++ < limit) {
      const resolved = clampToMonth(cursor, targetDay);
      if (resolved >= from && resolved <= hardEnd) out.push(resolved);
      cursor = addMonths(cursor, step);
    }
    return out;
  }

  if (cadence === 'semimonthly') {
    // Twice a month, on the 1st and 15th relative to the anchor day.
    let cursor = startDate;
    let guard = 0;
    while (cursor <= hardEnd && guard++ < limit) {
      if (cursor >= from) out.push(cursor);
      const day = Number(cursor.slice(8, 10));
      cursor = day < 15 ? clampToMonth(cursor, 15) : clampToMonth(addMonths(cursor, 1), Number(startDate.slice(8, 10)));
    }
    return out;
  }

  const stepDays = cadence === 'weekly' ? 7 * interval : cadence === 'biweekly' ? 14 * interval : interval;
  let cursor = startDate;
  let guard = 0;
  // Skip forward in whole steps rather than day by day, so a schedule that started
  // years ago does not cost thousands of iterations.
  if (cursor < from) {
    const skip = Math.floor(daysBetween(cursor, from) / stepDays);
    cursor = addDays(cursor, skip * stepDays);
  }
  while (cursor <= hardEnd && guard++ < limit) {
    if (cursor >= from) out.push(cursor);
    cursor = addDays(cursor, stepDays);
  }
  return out;
}

function clampToMonth(date: IsoDate, day: number): IsoDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const last = daysInMonth(year, month);
  const resolved = Math.min(day, last);
  return `${date.slice(0, 7)}-${String(resolved).padStart(2, '0')}`;
}

function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function nextOccurrence(schedule: ManualSchedule, today: IsoDate): IsoDate | null {
  const window = occurrencesBetween(schedule, today, addMonths(today, 14), 40);
  return window[0] ?? null;
}

/**
 * Present a manual schedule in the same shape as a detected one, so that the
 * forecast, calendar and position calculations consume a single type and cannot
 * treat the two sources differently.
 */
export function manualScheduleToSeries(schedule: ManualSchedule, today: IsoDate): DetectedSeries {
  const next = nextOccurrence(schedule, today) ?? schedule.startDate;
  return {
    key: `manual:${schedule.id}`,
    name: schedule.name,
    merchantName: schedule.name,
    categoryId: schedule.categoryId,
    accountId: schedule.accountId,
    type: schedule.type,
    cadence: schedule.cadence,
    intervalDays: intervalInDays(schedule),
    amountMinor: absMinor(schedule.amountMinor),
    amountVarianceBps: 0,
    firstSeenDate: schedule.startDate,
    lastSeenDate: schedule.startDate,
    nextExpectedDate: next,
    occurrenceCount: 0,
    // A schedule the user typed in is a statement of fact, not an inference.
    confidence: 100,
    priceChanges: [],
    transactionIds: [],
    kind: schedule.type === 'income' ? 'income' : schedule.direction === 'inflow' ? 'income' : 'bill',
    direction: schedule.direction,
  };
}

function intervalInDays(schedule: ManualSchedule): number {
  const n = Math.max(1, schedule.interval || 1);
  switch (schedule.cadence) {
    case 'weekly': return 7 * n;
    case 'biweekly': return 14 * n;
    case 'semimonthly': return 15;
    case 'monthly': return Math.round(30.44 * n);
    case 'quarterly': return Math.round(91.31 * n);
    case 'annual': return Math.round(365.25 * n);
    default: return n;
  }
}

/** Monthly-equivalent cost, for budget and summary figures. */
export function monthlyCostMinor(schedule: ManualSchedule): bigint {
  const amount = absMinor(schedule.amountMinor);
  const n = BigInt(Math.max(1, schedule.interval || 1));
  switch (schedule.cadence) {
    case 'weekly': return (amount * 52n) / (12n * n);
    case 'biweekly': return (amount * 26n) / (12n * n);
    case 'semimonthly': return amount * 2n;
    case 'monthly': return amount / n;
    case 'quarterly': return amount / (3n * n);
    case 'annual': return amount / (12n * n);
    default: {
      const perYear = 365n / BigInt(Math.max(1, schedule.interval || 1));
      return (amount * perYear) / 12n;
    }
  }
}

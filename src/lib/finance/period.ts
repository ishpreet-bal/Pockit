/**
 * Period and calendar-date maths.
 *
 * All dates here are ISO `YYYY-MM-DD` strings treated as calendar days in the user's
 * timezone. Using `Date` objects for this is a classic source of off-by-one-day bugs
 * when the server runs in UTC and the user is in Toronto: `new Date('2026-09-01')`
 * is midnight UTC, which is 2026-08-31 20:00 locally.
 */
import type { DateRange, IsoDate } from './types';

export type PeriodPreset =
  | 'this_week' | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months'
  | 'year_to_date' | 'last_year' | 'last_12_months' | 'all_time' | 'custom';

export const PERIOD_LABELS: Record<Exclude<PeriodPreset, 'custom'>, string> = {
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  last_6_months: 'Last 6 months',
  year_to_date: 'Year to date',
  last_year: 'Last year',
  last_12_months: 'Last 12 months',
  all_time: 'All time',
};

/* ---------------- primitives ---------------- */

export function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

function parts(d: IsoDate): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number);
  return [y ?? 1970, m ?? 1, day ?? 1];
}

function fmt(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Days in a month, 1-indexed month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = parts(date);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Add months, clamping the day so 31 Jan + 1 month is 28/29 Feb rather than 3 Mar. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = parts(date);
  const totalMonths = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(totalMonths / 12);
  const nm = (totalMonths % 12 + 12) % 12 + 1;
  return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Whole months between two dates, rounded down, plus the day remainder. */
export function diffMonths(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) months -= 1;
  return months;
}

export function startOfMonth(date: IsoDate): IsoDate {
  const [y, m] = parts(date);
  return fmt(y, m, 1);
}

export function endOfMonth(date: IsoDate): IsoDate {
  const [y, m] = parts(date);
  return fmt(y, m, daysInMonth(y, m));
}

/** ISO week starts Monday. */
export function startOfWeek(date: IsoDate, weekStartsOn: 0 | 1 = 1): IsoDate {
  const [y, m, d] = parts(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(date, -delta);
}

export function endOfWeek(date: IsoDate, weekStartsOn: 0 | 1 = 1): IsoDate {
  return addDays(startOfWeek(date, weekStartsOn), 6);
}

export function startOfYear(date: IsoDate): IsoDate {
  return fmt(parts(date)[0], 1, 1);
}

export function endOfYear(date: IsoDate): IsoDate {
  return fmt(parts(date)[0], 12, 31);
}

export function dayOfWeek(date: IsoDate): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6;
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

/** "today" in the user's timezone, as a calendar date. */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    // en-CA formats as YYYY-MM-DD, which is exactly what we want.
    return f.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function clampDate(date: IsoDate, range: DateRange): IsoDate {
  if (date < range.start) return range.start;
  if (date > range.end) return range.end;
  return date;
}

export function withinRange(date: IsoDate, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function rangeLengthDays(range: DateRange): number {
  return diffDays(range.start, range.end) + 1;
}

/* ---------------- presets ---------------- */

export function resolvePeriod(
  preset: PeriodPreset,
  today: IsoDate,
  custom?: Partial<DateRange>,
): DateRange {
  switch (preset) {
    case 'this_week':
      return { start: startOfWeek(today), end: endOfWeek(today) };
    case 'this_month':
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case 'last_month': {
      const prev = addMonths(startOfMonth(today), -1);
      return { start: prev, end: endOfMonth(prev) };
    }
    case 'last_3_months':
      return { start: startOfMonth(addMonths(today, -2)), end: endOfMonth(today) };
    case 'last_6_months':
      return { start: startOfMonth(addMonths(today, -5)), end: endOfMonth(today) };
    case 'last_12_months':
      return { start: startOfMonth(addMonths(today, -11)), end: endOfMonth(today) };
    case 'year_to_date':
      return { start: startOfYear(today), end: today };
    case 'last_year': {
      const lastYear = addMonths(startOfYear(today), -12);
      return { start: lastYear, end: endOfYear(lastYear) };
    }
    case 'all_time':
      return { start: '1970-01-01', end: today };
    case 'custom':
      return {
        start: custom?.start && isIsoDate(custom.start) ? custom.start : startOfMonth(today),
        end: custom?.end && isIsoDate(custom.end) ? custom.end : today,
      };
  }
}

/** The equivalent range one period earlier, for month-over-month comparison. */
export function previousPeriod(range: DateRange): DateRange {
  const length = rangeLengthDays(range);
  // Month-aligned ranges compare against the previous calendar month, which is what a
  // user means by "last month" even though months differ in length.
  if (range.start === startOfMonth(range.start) && range.end === endOfMonth(range.end)) {
    const months = diffMonths(startOfMonth(range.start), startOfMonth(range.end)) + 1;
    const prevStart = addMonths(range.start, -months);
    return { start: prevStart, end: endOfMonth(addMonths(prevStart, months - 1)) };
  }
  return { start: addDays(range.start, -length), end: addDays(range.start, -1) };
}

/** Split a range into calendar months, clipped to the range. */
export function monthsInRange(range: DateRange): DateRange[] {
  const out: DateRange[] = [];
  let cursor = startOfMonth(range.start);
  while (cursor <= range.end) {
    const monthEnd = endOfMonth(cursor);
    out.push({
      start: cursor > range.start ? cursor : range.start,
      end: monthEnd < range.end ? monthEnd : range.end,
    });
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/** Split a range into days. */
export function daysInRange(range: DateRange): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Split a range into weeks. */
export function weeksInRange(range: DateRange): DateRange[] {
  const out: DateRange[] = [];
  let cursor = startOfWeek(range.start);
  while (cursor <= range.end) {
    const weekEnd = addDays(cursor, 6);
    out.push({
      start: cursor > range.start ? cursor : range.start,
      end: weekEnd < range.end ? weekEnd : range.end,
    });
    cursor = addDays(cursor, 7);
  }
  return out;
}

/**
 * How far through a period we are, 0..1. Drives the "you have used 68% of this budget
 * but only 40% of the month has passed" comparison.
 */
export function periodElapsedFraction(range: DateRange, today: IsoDate): number {
  const total = rangeLengthDays(range);
  if (total <= 0) return 1;
  if (today < range.start) return 0;
  if (today > range.end) return 1;
  return (diffDays(range.start, today) + 1) / total;
}

export function formatRange(range: DateRange, locale = 'en-CA'): string {
  const f = (d: IsoDate) => {
    const [y, m, day] = parts(d);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(locale, {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
  };
  return `${f(range.start)} – ${f(range.end)}`;
}

/**
 * Recurring expense and subscription detection (spec §12).
 *
 * Deterministic: group transactions by normalised merchant, look for a stable cadence
 * and a stable amount, and score the confidence. Nothing here calls a model — a
 * subscription dashboard that silently changes its mind between page loads is worse
 * than no dashboard.
 */
import { absMinor, sumMinor, mulRatio } from '@/lib/money';
import type { IsoDate, LedgerTxn, TxnType } from './types';
import { addDays, addMonths, diffDays } from './period';
import { normalizeMerchant } from './duplicates';

export type Cadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annual' | 'custom';

const CADENCE_DAYS: Record<Exclude<Cadence, 'custom'>, number> = {
  weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30.44, quarterly: 91.31, annual: 365.25,
};

/** Tolerance in days for matching an observed gap to a cadence. */
const CADENCE_TOLERANCE: Record<Exclude<Cadence, 'custom'>, number> = {
  weekly: 2, biweekly: 3, semimonthly: 3, monthly: 5, quarterly: 10, annual: 20,
};

export interface DetectedSeries {
  key: string;
  name: string;
  merchantName: string;
  categoryId: string | null;
  accountId: string | null;
  type: TxnType;
  cadence: Cadence;
  intervalDays: number;
  /** Median amount — robust against one unusual month. */
  amountMinor: bigint;
  amountVarianceBps: number;
  firstSeenDate: IsoDate;
  lastSeenDate: IsoDate;
  nextExpectedDate: IsoDate;
  occurrenceCount: number;
  /** 0-100. */
  confidence: number;
  /** Amount increases over time, for the "your subscription went up" signal. */
  priceChanges: { date: IsoDate; fromMinor: bigint; toMinor: bigint }[];
  transactionIds: string[];
  kind: 'subscription' | 'bill' | 'income' | 'transfer' | 'other';
}

const MIN_OCCURRENCES = 3;

/**
 * Find recurring series in a transaction history.
 * `minOccurrences` of 3 is the point where a pattern stops being a coincidence; two
 * transactions a month apart is not yet a subscription.
 */
export function detectRecurring(
  txns: readonly LedgerTxn[],
  today: IsoDate,
  minOccurrences: number = MIN_OCCURRENCES,
): DetectedSeries[] {
  const groups = new Map<string, LedgerTxn[]>();

  for (const t of txns) {
    if (t.type === 'refund') continue;
    const merchant = normalizeMerchant(t.merchantName ?? t.description);
    if (!merchant) continue;
    // Group by merchant AND account AND direction: the same vendor billing two cards
    // is two series, and income is never merged with an expense.
    const key = `${merchant}|${t.accountId}|${t.type}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const out: DetectedSeries[] = [];

  for (const [key, group] of groups) {
    if (group.length < minOccurrences) continue;
    const sorted = [...group].sort((a, b) => a.postedDate.localeCompare(b.postedDate));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(diffDays(sorted[i - 1]!.postedDate, sorted[i]!.postedDate));
    }
    // Same-day repeats are not a cadence (two coffees on one morning).
    if (gaps.every((g) => g === 0)) continue;

    const medianGap = median(gaps.filter((g) => g > 0));
    if (!medianGap || medianGap < 5 || medianGap > 400) continue;

    const { cadence, intervalDays } = classifyCadence(medianGap);

    const amounts = sorted.map((t) => absMinor(t.baseAmountMinor));
    const medianAmount = medianBig(amounts);
    if (medianAmount === 0n) continue;

    // Amount stability: a subscription's amount barely moves; groceries vary wildly.
    const deviations = amounts.map((a) => {
      const d = a > medianAmount ? a - medianAmount : medianAmount - a;
      return Number(mulRatio(d, 10_000n, medianAmount));
    });
    const meanDeviationBps = Math.round(deviations.reduce((s, d) => s + d, 0) / deviations.length);

    // Cadence stability.
    const tolerance = cadence === 'custom' ? Math.max(3, medianGap * 0.2) : CADENCE_TOLERANCE[cadence];
    const onSchedule = gaps.filter((g) => Math.abs(g - medianGap) <= tolerance).length;
    const cadenceStability = gaps.length > 0 ? onSchedule / gaps.length : 0;

    const confidence = scoreConfidence({
      occurrences: sorted.length,
      cadenceStability,
      meanDeviationBps,
      cadence,
    });
    if (confidence < 40) continue;

    const last = sorted[sorted.length - 1]!;
    const next = nextExpected(last.postedDate, cadence, intervalDays, today);

    out.push({
      key,
      name: displayName(last),
      merchantName: last.merchantName ?? last.description,
      categoryId: last.categoryId,
      accountId: last.accountId,
      type: last.type,
      cadence,
      intervalDays,
      amountMinor: medianAmount,
      amountVarianceBps: meanDeviationBps,
      firstSeenDate: sorted[0]!.postedDate,
      lastSeenDate: last.postedDate,
      nextExpectedDate: next,
      occurrenceCount: sorted.length,
      confidence,
      priceChanges: findPriceChanges(sorted),
      transactionIds: sorted.map((t) => t.id),
      kind: classifyKind(last, meanDeviationBps),
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence || Number(b.amountMinor - a.amountMinor));
}

function displayName(t: LedgerTxn): string {
  const name = (t.merchantName ?? t.description).trim();
  return name.length > 48 ? `${name.slice(0, 45)}…` : name;
}

function classifyCadence(medianGap: number): { cadence: Cadence; intervalDays: number } {
  let best: Cadence = 'custom';
  let bestDiff = Infinity;
  for (const [name, days] of Object.entries(CADENCE_DAYS) as [Exclude<Cadence, 'custom'>, number][]) {
    const diff = Math.abs(medianGap - days);
    if (diff <= CADENCE_TOLERANCE[name] && diff < bestDiff) {
      best = name;
      bestDiff = diff;
    }
  }
  return { cadence: best, intervalDays: Math.round(medianGap) };
}

function scoreConfidence(input: {
  occurrences: number;
  cadenceStability: number;
  meanDeviationBps: number;
  cadence: Cadence;
}): number {
  // More occurrences is stronger evidence, with diminishing returns.
  const occurrenceScore = Math.min(35, (input.occurrences - 2) * 9);
  const cadenceScore = input.cadenceStability * 35;
  // 0 bps deviation → full marks; 2000 bps (20%) → nothing.
  const amountScore = Math.max(0, 1 - input.meanDeviationBps / 2000) * 25;
  const namedCadenceBonus = input.cadence === 'custom' ? 0 : 5;
  return Math.round(Math.max(0, Math.min(100, occurrenceScore + cadenceScore + amountScore + namedCadenceBonus)));
}

function classifyKind(t: LedgerTxn, deviationBps: number): DetectedSeries['kind'] {
  if (t.type === 'income') return 'income';
  if (t.type === 'transfer' || t.type === 'debt_payment') return 'transfer';
  // A very stable amount reads as a subscription; a variable one as a utility bill.
  return deviationBps <= 300 ? 'subscription' : 'bill';
}

export function nextExpected(
  lastDate: IsoDate,
  cadence: Cadence,
  intervalDays: number,
  today: IsoDate,
): IsoDate {
  let next = advance(lastDate, cadence, intervalDays);
  let guard = 0;
  while (next < today && guard++ < 400) next = advance(next, cadence, intervalDays);
  return next;
}

function advance(date: IsoDate, cadence: Cadence, intervalDays: number): IsoDate {
  switch (cadence) {
    case 'monthly': return addMonths(date, 1);
    case 'quarterly': return addMonths(date, 3);
    case 'annual': return addMonths(date, 12);
    case 'weekly': return addDays(date, 7);
    case 'biweekly': return addDays(date, 14);
    case 'semimonthly': return addDays(date, 15);
    default: return addDays(date, Math.max(1, intervalDays));
  }
}

function findPriceChanges(sorted: readonly LedgerTxn[]): DetectedSeries['priceChanges'] {
  const changes: DetectedSeries['priceChanges'] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = absMinor(sorted[i - 1]!.baseAmountMinor);
    const cur = absMinor(sorted[i]!.baseAmountMinor);
    if (prev === 0n || prev === cur) continue;
    const diff = cur > prev ? cur - prev : prev - cur;
    // Only report a change above 3% — below that it is rounding or tax drift.
    if (mulRatio(diff, 10_000n, prev) >= 300n) {
      changes.push({ date: sorted[i]!.postedDate, fromMinor: prev, toMinor: cur });
    }
  }
  return changes;
}

/* ------------------------------------------------------------------ */
/* Subscription dashboard totals (spec §12)                            */
/* ------------------------------------------------------------------ */

export interface SubscriptionSummary {
  monthlyMinor: bigint;
  annualMinor: bigint;
  count: number;
  /** Ones the user has marked as no longer wanted. */
  unwantedMonthlyMinor: bigint;
  unwantedCount: number;
  byCadence: Record<string, { count: number; monthlyMinor: bigint }>;
}

/** Normalise any cadence to a monthly-equivalent cost. */
export function monthlyEquivalent(amountMinor: bigint, cadence: Cadence, intervalDays: number): bigint {
  switch (cadence) {
    case 'monthly': return amountMinor;
    case 'weekly': return mulRatio(amountMinor, 52n, 12n);
    case 'biweekly': return mulRatio(amountMinor, 26n, 12n);
    case 'semimonthly': return amountMinor * 2n;
    case 'quarterly': return mulRatio(amountMinor, 1n, 3n);
    case 'annual': return mulRatio(amountMinor, 1n, 12n);
    default: {
      const perYear = 365.25 / Math.max(1, intervalDays);
      return mulRatio(amountMinor, BigInt(Math.round(perYear * 100)), 1200n);
    }
  }
}

export function summarizeSubscriptions(
  series: readonly (DetectedSeries & { isWanted?: boolean | null })[],
): SubscriptionSummary {
  let monthly = 0n;
  let unwantedMonthly = 0n;
  let unwantedCount = 0;
  const byCadence: SubscriptionSummary['byCadence'] = {};

  const relevant = series.filter((s) => s.kind === 'subscription' || s.kind === 'bill');

  for (const s of relevant) {
    const m = monthlyEquivalent(s.amountMinor, s.cadence, s.intervalDays);
    monthly += m;
    if (s.isWanted === false) {
      unwantedMonthly += m;
      unwantedCount++;
    }
    const bucket = byCadence[s.cadence] ?? { count: 0, monthlyMinor: 0n };
    bucket.count++;
    bucket.monthlyMinor += m;
    byCadence[s.cadence] = bucket;
  }

  return {
    monthlyMinor: monthly,
    annualMinor: monthly * 12n,
    count: relevant.length,
    unwantedMonthlyMinor: unwantedMonthly,
    unwantedCount,
    byCadence,
  };
}

/** Upcoming occurrences within a horizon, for the calendar and the forecast. */
export function upcomingOccurrences(
  series: readonly DetectedSeries[],
  from: IsoDate,
  toDate: IsoDate,
): { seriesKey: string; name: string; date: IsoDate; amountMinor: bigint; type: TxnType; categoryId: string | null }[] {
  const out: ReturnType<typeof upcomingOccurrences> = [];
  for (const s of series) {
    let cursor = s.nextExpectedDate;
    let guard = 0;
    while (cursor <= toDate && guard++ < 400) {
      if (cursor >= from) {
        out.push({
          seriesKey: s.key,
          name: s.name,
          date: cursor,
          amountMinor: s.amountMinor,
          type: s.type,
          categoryId: s.categoryId,
        });
      }
      cursor = advance(cursor, s.cadence, s.intervalDays);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Statistics helpers                                                  */
/* ------------------------------------------------------------------ */

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

export function medianBig(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  const s = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2n : s[mid]!;
}

export function meanBig(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  return sumMinor(values) / BigInt(values.length);
}

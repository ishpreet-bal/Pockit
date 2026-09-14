/**
 * Cash flow forecasting (spec §13) and Safe to Spend (spec §14).
 *
 * The spec defines these separately, which double-counts: §13 forecasts variable
 * spending, and §14 subtracts "expected essential spending" from available cash.
 * Applying both naively removes the same money twice.
 *
 * Resolution: there is ONE model. `forecast()` projects a balance forward from known
 * scheduled items plus an estimated variable rate. `safeToSpend()` is a projection of
 * that same model — it asks "of today's cash, how much is not already claimed?" and
 * takes its essential-spending figure from the same estimate the forecast uses.
 *
 * Known and estimated amounts are kept separate throughout, because the user needs to
 * know which parts of a projection are facts and which are guesses (spec §13).
 */
import { sumMinor, absMinor, mulRatio } from '@/lib/money';
import type { DateRange, IsoDate, LedgerTxn, LedgerCategory, TxnType } from './types';
import { addDays, diffDays, daysInRange, monthsInRange } from './period';
import { periodTotals, spendingByCategory } from './ledger';
import type { DetectedSeries } from './recurring';
import { upcomingOccurrences } from './recurring';

export interface ScheduledItem {
  date: IsoDate;
  name: string;
  amountMinor: bigint;
  type: TxnType;
  categoryId: string | null;
  /** 'known' items are scheduled and dated; 'estimated' are modelled. */
  certainty: 'known' | 'estimated';
  sourceKey: string;
}

export interface ForecastDay {
  date: IsoDate;
  openingMinor: bigint;
  knownIncomeMinor: bigint;
  knownExpenseMinor: bigint;
  estimatedExpenseMinor: bigint;
  closingMinor: bigint;
}

export interface ForecastResult {
  horizonDays: number;
  range: DateRange;
  startingBalanceMinor: bigint;
  expectedIncomeMinor: bigint;
  knownExpensesMinor: bigint;
  estimatedVariableSpendMinor: bigint;
  projectedBalanceMinor: bigint;
  /** The lowest the balance is projected to go, and when. */
  lowestPointMinor: bigint;
  lowestPointDate: IsoDate;
  days: ForecastDay[];
  scheduled: ScheduledItem[];
  /** Daily variable-spend rate derived from history, stated so it can be challenged. */
  dailyVariableRateMinor: bigint;
  basisMonths: number;
}

export interface ForecastInput {
  startingBalanceMinor: bigint;
  today: IsoDate;
  horizonDays: number;
  /** Detected or user-confirmed recurring series. */
  series: readonly DetectedSeries[];
  /** Explicit one-off scheduled items the user has entered. */
  plannedItems?: readonly ScheduledItem[];
  /** History used to estimate the variable spending rate. */
  historyTxns: readonly LedgerTxn[];
  historyRange: DateRange;
  categories: readonly LedgerCategory[];
}

/**
 * Project a balance forward.
 *
 * Variable spending is estimated as a daily rate from history, EXCLUDING anything
 * already represented by a recurring series — otherwise Netflix is counted both as a
 * scheduled bill and as part of the average daily burn.
 */
export function forecast(input: ForecastInput): ForecastResult {
  const { startingBalanceMinor, today, horizonDays, series, historyTxns, historyRange } = input;
  const end = addDays(today, horizonDays);
  const range: DateRange = { start: today, end };

  const dailyVariableRateMinor = estimateDailyVariableRate(historyTxns, historyRange);

  const scheduled: ScheduledItem[] = [];

  for (const occ of upcomingOccurrences(series, today, end)) {
    scheduled.push({
      date: occ.date,
      name: occ.name,
      amountMinor: absMinor(occ.amountMinor),
      type: occ.type,
      categoryId: occ.categoryId,
      certainty: 'known',
      sourceKey: occ.seriesKey,
    });
  }
  for (const item of input.plannedItems ?? []) {
    if (item.date >= today && item.date <= end) scheduled.push(item);
  }
  scheduled.sort((a, b) => a.date.localeCompare(b.date));

  const byDate = new Map<IsoDate, ScheduledItem[]>();
  for (const s of scheduled) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const days: ForecastDay[] = [];
  let balance = startingBalanceMinor;
  let lowest = startingBalanceMinor;
  let lowestDate = today;
  let totalIncome = 0n;
  let totalKnownExpense = 0n;
  let totalEstimated = 0n;

  for (const date of daysInRange(range)) {
    const opening = balance;
    let knownIncome = 0n;
    let knownExpense = 0n;

    for (const item of byDate.get(date) ?? []) {
      if (item.type === 'income') knownIncome += item.amountMinor;
      else if (item.type === 'transfer' || item.type === 'debt_payment') continue;
      else knownExpense += item.amountMinor;
    }

    // Today itself is already reflected in the starting balance, so no estimate for it.
    const estimated = date === today ? 0n : dailyVariableRateMinor;

    balance = opening + knownIncome - knownExpense - estimated;
    totalIncome += knownIncome;
    totalKnownExpense += knownExpense;
    totalEstimated += estimated;

    if (balance < lowest) {
      lowest = balance;
      lowestDate = date;
    }

    days.push({
      date,
      openingMinor: opening,
      knownIncomeMinor: knownIncome,
      knownExpenseMinor: knownExpense,
      estimatedExpenseMinor: estimated,
      closingMinor: balance,
    });
  }

  return {
    horizonDays,
    range,
    startingBalanceMinor,
    expectedIncomeMinor: totalIncome,
    knownExpensesMinor: totalKnownExpense,
    estimatedVariableSpendMinor: totalEstimated,
    projectedBalanceMinor: balance,
    lowestPointMinor: lowest,
    lowestPointDate: lowestDate,
    days,
    scheduled,
    dailyVariableRateMinor,
    basisMonths: monthsInRange(historyRange).length,
  };
}

/**
 * Average daily spend on things that are NOT part of a recurring series and NOT
 * one-off outliers. Recurring items are forecast explicitly by date, so including
 * them here would double-count them.
 */
export function estimateDailyVariableRate(
  txns: readonly LedgerTxn[],
  range: DateRange,
): bigint {
  const inRange = txns.filter(
    (t) => t.postedDate >= range.start && t.postedDate <= range.end && !t.isRecurring,
  );
  const totals = periodTotals(inRange);
  const days = Math.max(1, diffDays(range.start, range.end) + 1);
  if (totals.expenses <= 0n) return 0n;
  return totals.expenses / BigInt(days);
}

/* ------------------------------------------------------------------ */
/* Safe to Spend (spec §14)                                            */
/* ------------------------------------------------------------------ */

export type SafeToSpendHorizon = 'until_payday' | 'this_week' | 'this_month';

export interface SafeToSpendLine {
  label: string;
  amountMinor: bigint;
  certainty: 'known' | 'estimated';
  detail: string;
}

export interface SafeToSpendResult {
  horizon: SafeToSpendHorizon;
  throughDate: IsoDate;
  availableMinor: bigint;
  upcomingBillsMinor: bigint;
  savingsCommitmentMinor: bigint;
  plannedInvestmentMinor: bigint;
  essentialSpendMinor: bigint;
  safeToSpendMinor: bigint;
  lines: SafeToSpendLine[];
  /** Expected income arriving before the horizon, shown but NOT counted as available. */
  incomingMinor: bigint;
  assumptions: string[];
}

export interface SafeToSpendInput {
  availableCashMinor: bigint;
  today: IsoDate;
  throughDate: IsoDate;
  horizon: SafeToSpendHorizon;
  series: readonly DetectedSeries[];
  plannedItems?: readonly ScheduledItem[];
  /** Monthly savings/goal commitments, pro-rated across the horizon. */
  monthlySavingsCommitmentMinor: bigint;
  monthlyInvestmentCommitmentMinor: bigint;
  historyTxns: readonly LedgerTxn[];
  historyRange: DateRange;
  categories: readonly LedgerCategory[];
  /** Count income expected before the horizon as spendable. Off by default: money you
   *  have not been paid yet is not money you can safely spend. */
  includeExpectedIncome?: boolean;
}

export function safeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const days = Math.max(1, diffDays(input.today, input.throughDate) + 1);
  const monthFraction = days / 30.44;

  const upcoming = upcomingOccurrences(input.series, input.today, input.throughDate);
  let bills = 0n;
  let incoming = 0n;
  for (const occ of upcoming) {
    if (occ.type === 'income') incoming += absMinor(occ.amountMinor);
    else if (occ.type === 'transfer' || occ.type === 'debt_payment') continue;
    else bills += absMinor(occ.amountMinor);
  }
  for (const item of input.plannedItems ?? []) {
    if (item.date < input.today || item.date > input.throughDate) continue;
    if (item.type === 'income') incoming += item.amountMinor;
    else bills += item.amountMinor;
  }

  const savings = proRate(input.monthlySavingsCommitmentMinor, monthFraction);
  const investment = proRate(input.monthlyInvestmentCommitmentMinor, monthFraction);

  // Essential spending comes from the SAME estimate the forecast uses, restricted to
  // categories the user has marked essential. This is what stops the double count.
  const essentialDaily = estimateEssentialDailyRate(input.historyTxns, input.historyRange, input.categories);
  const essential = essentialDaily * BigInt(days);

  const base = input.availableCashMinor + (input.includeExpectedIncome ? incoming : 0n);
  const safe = base - bills - savings - investment - essential;

  const lines: SafeToSpendLine[] = [
    { label: 'Available now', amountMinor: base, certainty: 'known', detail: 'Cash in your chequing, savings and cash accounts' },
    { label: 'Upcoming bills', amountMinor: -bills, certainty: 'known', detail: `${upcoming.filter((u) => u.type !== 'income').length} scheduled through ${input.throughDate}` },
    { label: 'Savings commitment', amountMinor: -savings, certainty: 'known', detail: 'Your goal contributions, pro-rated for this period' },
    { label: 'Planned investing', amountMinor: -investment, certainty: 'known', detail: 'Your investment contributions, pro-rated for this period' },
    { label: 'Essential spending', amountMinor: -essential, certainty: 'estimated', detail: 'Estimated from your own history on essential categories' },
  ];

  const assumptions = [
    `Covers ${days} day${days === 1 ? '' : 's'}, through ${input.throughDate}.`,
    `Essential spending is estimated at about ${centsToWords(essentialDaily)} per day from your recent history on categories you have marked essential.`,
    input.includeExpectedIncome
      ? `Includes ${centsToWords(incoming)} of income expected before then.`
      : `Does not count income you have not received yet${incoming > 0n ? ` (${centsToWords(incoming)} expected)` : ''}.`,
    'This is an estimate based on your own records, not a spending recommendation.',
  ];

  return {
    horizon: input.horizon,
    throughDate: input.throughDate,
    availableMinor: base,
    upcomingBillsMinor: bills,
    savingsCommitmentMinor: savings,
    plannedInvestmentMinor: investment,
    essentialSpendMinor: essential,
    safeToSpendMinor: safe,
    lines,
    incomingMinor: incoming,
    assumptions,
  };
}

function proRate(monthlyMinor: bigint, monthFraction: number): bigint {
  if (monthlyMinor <= 0n) return 0n;
  return mulRatio(monthlyMinor, BigInt(Math.round(monthFraction * 1000)), 1000n);
}

export function estimateEssentialDailyRate(
  txns: readonly LedgerTxn[],
  range: DateRange,
  categories: readonly LedgerCategory[],
): bigint {
  const essentialIds = new Set(categories.filter((c) => c.necessity === 'essential').map((c) => c.id));
  const inRange = txns.filter(
    (t) => t.postedDate >= range.start && t.postedDate <= range.end && !t.isRecurring,
  );
  const byCategory = spendingByCategory(inRange);
  const essentialTotal = sumMinor(
    byCategory.filter((c) => c.categoryId && essentialIds.has(c.categoryId)).map((c) => c.amountMinor),
  );
  const days = Math.max(1, diffDays(range.start, range.end) + 1);
  return essentialTotal > 0n ? essentialTotal / BigInt(days) : 0n;
}

function centsToWords(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  const dollars = abs / 100n;
  const cents = abs % 100n;
  return `$${dollars}${cents > 0n ? `.${cents.toString().padStart(2, '0')}` : ''}`;
}

/** Resolve the end date for a Safe-to-Spend horizon. */
export function resolveHorizon(
  horizon: SafeToSpendHorizon,
  today: IsoDate,
  nextPayday: IsoDate | null,
  endOfMonthDate: IsoDate,
  endOfWeekDate: IsoDate,
): IsoDate {
  if (horizon === 'until_payday') return nextPayday && nextPayday > today ? nextPayday : endOfMonthDate;
  if (horizon === 'this_week') return endOfWeekDate;
  return endOfMonthDate;
}

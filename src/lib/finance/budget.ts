/**
 * Budgeting — six methods over one engine (spec §5, §6).
 *
 * The methods differ in how a target is DERIVED, not in how spending is measured.
 * Every method resolves to a set of {categoryId | bucket} → target amount, and from
 * there the tracking maths is identical. That keeps the six philosophies from
 * becoming six divergent implementations.
 */
import { applyBps, absMinor, sumMinor } from '@/lib/money';
import type { DateRange, IsoDate, LedgerTxn, LedgerCategory } from './types';
import { spendingByCategory, periodTotals, rollUpCategories } from './ledger';
import { periodElapsedFraction, rangeLengthDays, diffDays, addDays, addMonths, endOfMonth } from './period';

export type BudgetMethod =
  | 'category' | 'percentage' | 'zero_based' | 'savings_first' | 'fixed_variable' | 'custom';
export type BudgetPeriodKind = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'custom';
export type Bucket = 'needs' | 'wants' | 'savings' | 'debt';

export interface BudgetAllocationInput {
  id: string;
  categoryId: string | null;
  bucket: Bucket | null;
  label: string | null;
  amountMinor: bigint | null;
  percentBps: number | null;
}

export interface BudgetInput {
  id: string;
  name: string;
  method: BudgetMethod;
  period: BudgetPeriodKind;
  periodStart: IsoDate;
  periodDays: number | null;
  expectedIncomeMinor: bigint | null;
  rollover: boolean;
  allocations: BudgetAllocationInput[];
}

/* ------------------------------------------------------------------ */
/* Period resolution                                                   */
/* ------------------------------------------------------------------ */

/** The budget period containing `today`, given the budget's anchor and cadence. */
export function currentBudgetPeriod(budget: BudgetInput, today: IsoDate): DateRange {
  const { period, periodStart, periodDays } = budget;

  if (period === 'monthly') {
    let start = periodStart;
    // Walk forward in whole months to the period containing today.
    while (endOfMonthFrom(start) < today) start = addMonths(start, 1);
    while (start > today) start = addMonths(start, -1);
    return { start, end: endOfMonthFrom(start) };
  }

  const lengthDays =
    period === 'weekly' ? 7
    : period === 'biweekly' ? 14
    : period === 'semimonthly' ? 15
    : Math.max(1, periodDays ?? 30);

  const elapsed = diffDays(periodStart, today);
  const index = Math.floor(elapsed / lengthDays);
  const start = addDays(periodStart, index * lengthDays);
  return { start, end: addDays(start, lengthDays - 1) };
}

function endOfMonthFrom(start: IsoDate): IsoDate {
  // A monthly budget anchored mid-month runs to the day before the same day next month.
  const day = Number(start.slice(8, 10));
  if (day === 1) return endOfMonth(start);
  return addDays(addMonths(start, 1), -1);
}

/* ------------------------------------------------------------------ */
/* Target resolution — where the six methods differ                    */
/* ------------------------------------------------------------------ */

export interface ResolvedTarget {
  key: string;
  categoryId: string | null;
  bucket: Bucket | null;
  label: string;
  targetMinor: bigint;
  /** How the target was arrived at, shown in the UI so no number is unexplained. */
  basis: string;
}

/**
 * Resolve a budget into concrete per-line targets.
 * `incomeMinor` is the expected income for the period: the budget's own figure when
 * set, otherwise actual income observed in the period.
 */
export function resolveTargets(budget: BudgetInput, incomeMinor: bigint): ResolvedTarget[] {
  const income = budget.expectedIncomeMinor ?? incomeMinor;

  switch (budget.method) {
    case 'category':
    case 'custom':
    case 'fixed_variable':
      return budget.allocations.map((a) => ({
        key: a.id,
        categoryId: a.categoryId,
        bucket: a.bucket,
        label: a.label ?? '',
        targetMinor: a.amountMinor ?? (a.percentBps !== null ? applyBps(income, a.percentBps) : 0n),
        basis: a.amountMinor !== null ? 'Fixed amount' : `${((a.percentBps ?? 0) / 100).toFixed(1)}% of income`,
      }));

    case 'percentage':
    case 'savings_first':
      return budget.allocations.map((a) => {
        const target = a.percentBps !== null ? applyBps(income, a.percentBps) : (a.amountMinor ?? 0n);
        return {
          key: a.id,
          categoryId: a.categoryId,
          bucket: a.bucket,
          label: a.label ?? a.bucket ?? '',
          targetMinor: target,
          basis: a.percentBps !== null
            ? `${(a.percentBps / 100).toFixed(1)}% of ${formatIncomeBasis(budget)}`
            : 'Fixed amount',
        };
      });

    case 'zero_based': {
      // Every dollar of expected income is assigned. Explicit amounts win; whatever
      // remains is surfaced as an "Unassigned" line rather than quietly ignored.
      const explicit = budget.allocations.map((a) => ({
        key: a.id,
        categoryId: a.categoryId,
        bucket: a.bucket,
        label: a.label ?? '',
        targetMinor: a.amountMinor ?? (a.percentBps !== null ? applyBps(income, a.percentBps) : 0n),
        basis: 'Assigned',
      }));
      const assigned = sumMinor(explicit.map((e) => e.targetMinor));
      const unassigned = income - assigned;
      if (unassigned !== 0n) {
        explicit.push({
          key: '__unassigned__',
          categoryId: null,
          bucket: null,
          label: 'Unassigned',
          targetMinor: unassigned,
          basis: 'Income not yet given a job',
        });
      }
      return explicit;
    }
  }
}

function formatIncomeBasis(budget: BudgetInput): string {
  return budget.expectedIncomeMinor !== null ? 'expected income' : 'actual income';
}

/* ------------------------------------------------------------------ */
/* Tracking                                                            */
/* ------------------------------------------------------------------ */

export interface BudgetLineStatus {
  key: string;
  categoryId: string | null;
  bucket: Bucket | null;
  label: string;
  basis: string;
  targetMinor: bigint;
  spentMinor: bigint;
  remainingMinor: bigint;
  /** 0..n, where 1.0 means fully consumed. May exceed 1. */
  consumedFraction: number;
  /** Straight-line projection of end-of-period spending at the current rate. */
  projectedMinor: bigint;
  projectedOverageMinor: bigint;
  status: 'under' | 'on_track' | 'approaching' | 'over';
  transactionIds: string[];
  /** Left over from last period and added to this one (rollover budgets). Already included in targetMinor. */
  carriedMinor: bigint;
}

export interface BudgetStatus {
  budgetId: string;
  period: DateRange;
  elapsedFraction: number;
  daysRemaining: number;
  totalTargetMinor: bigint;
  totalSpentMinor: bigint;
  totalRemainingMinor: bigint;
  lines: BudgetLineStatus[];
  /** Factual, non-judgemental notices (spec §6). */
  warnings: BudgetWarning[];
}

export interface BudgetWarning {
  key: string;
  severity: 'info' | 'notice' | 'attention';
  message: string;
  categoryId: string | null;
}

export function evaluateBudget(
  budget: BudgetInput,
  txns: readonly LedgerTxn[],
  categories: readonly LedgerCategory[],
  today: IsoDate,
  period?: DateRange,
  /**
   * Transactions covering the previous period too. Only with these can a rollover
   * budget work out what was left over — without them nothing is carried.
   */
  history?: readonly LedgerTxn[],
): BudgetStatus {
  const range = period ?? currentBudgetPeriod(budget, today);
  const carry = budget.rollover && history ? carriedOver(budget, history, categories, range) : new Map<string, bigint>();
  const inPeriod = txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);

  const totals = periodTotals(inPeriod);
  const targets = resolveTargets(budget, totals.income);

  const leafTotals = spendingByCategory(inPeriod);
  const rolled = rollUpCategories(leafTotals, categories);
  const idsByCategory = new Map<string, string[]>();
  for (const l of leafTotals) if (l.categoryId) idsByCategory.set(l.categoryId, l.transactionIds);

  const elapsed = periodElapsedFraction(range, today);
  const daysRemaining = Math.max(0, diffDays(today, range.end));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const lines: BudgetLineStatus[] = targets.map((base) => {
    const carried = carry.get(base.key) ?? 0n;
    const target = carried ? { ...base, targetMinor: base.targetMinor + carried } : base;
    let spent = 0n;
    let ids: string[] = [];

    if (target.categoryId) {
      // Rolled-up total so a parent line covers its children.
      spent = rolled.get(target.categoryId) ?? 0n;
      ids = collectDescendantIds(target.categoryId, categories, idsByCategory);
    } else if (target.bucket) {
      const matched = leafTotals.filter((l) => {
        const cat = l.categoryId ? categoryById.get(l.categoryId) : undefined;
        return cat ? bucketForCategory(cat) === target.bucket : target.bucket === 'wants';
      });
      spent = sumMinor(matched.map((m) => m.amountMinor));
      ids = matched.flatMap((m) => m.transactionIds);
    }

    const remaining = target.targetMinor - spent;
    const consumedFraction = target.targetMinor > 0n ? Number(spent) / Number(target.targetMinor) : spent > 0n ? Infinity : 0;
    const projected = elapsed > 0.02 ? BigInt(Math.round(Number(spent) / elapsed)) : spent;
    const projectedOverage = projected - target.targetMinor;

    let status: BudgetLineStatus['status'];
    if (spent > target.targetMinor) status = 'over';
    else if (consumedFraction >= 0.85) status = 'approaching';
    else if (consumedFraction > elapsed + 0.15) status = 'approaching';
    else status = consumedFraction <= elapsed + 0.05 ? 'on_track' : 'under';
    if (consumedFraction < elapsed - 0.15) status = 'under';

    return {
      key: target.key,
      categoryId: target.categoryId,
      bucket: target.bucket,
      label: target.label || (target.categoryId ? categoryById.get(target.categoryId)?.name ?? '' : ''),
      basis: target.basis,
      targetMinor: target.targetMinor,
      spentMinor: spent,
      remainingMinor: remaining,
      consumedFraction,
      projectedMinor: projected,
      projectedOverageMinor: projectedOverage,
      status,
      transactionIds: ids,
      carriedMinor: carried,
    };
  });

  return {
    budgetId: budget.id,
    period: range,
    elapsedFraction: elapsed,
    daysRemaining,
    totalTargetMinor: sumMinor(lines.map((l) => l.targetMinor)),
    totalSpentMinor: sumMinor(lines.map((l) => l.spentMinor)),
    totalRemainingMinor: sumMinor(lines.map((l) => l.remainingMinor)),
    lines,
    warnings: buildWarnings(lines, daysRemaining),
  };
}

/**
 * What each category line didn't use last period. Underspending carries forward
 * (capped at one period's amount, so a forgotten budget can't balloon);
 * overspending doesn't carry as debt — a new period is a fresh start.
 */
function carriedOver(budget: BudgetInput, history: readonly LedgerTxn[], categories: readonly LedgerCategory[], range: DateRange): Map<string, bigint> {
  const out = new Map<string, bigint>();
  const prev = currentBudgetPeriod(budget, addDays(range.start, -1));
  if (prev.start < budget.periodStart) return out; // the budget didn't exist yet
  const inPrev = history.filter((t) => t.postedDate >= prev.start && t.postedDate <= prev.end);
  const rolled = rollUpCategories(spendingByCategory(inPrev), categories);
  for (const t of resolveTargets(budget, periodTotals(inPrev).income)) {
    if (!t.categoryId || t.targetMinor <= 0n) continue;
    const left = t.targetMinor - (rolled.get(t.categoryId) ?? 0n);
    if (left > 0n) out.set(t.key, left < t.targetMinor ? left : t.targetMinor);
  }
  return out;
}

function collectDescendantIds(
  categoryId: string,
  categories: readonly LedgerCategory[],
  idsByCategory: Map<string, string[]>,
): string[] {
  const out = new Set<string>();
  const stack = [categoryId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const tid of idsByCategory.get(id) ?? []) out.add(tid);
    for (const c of categories) if (c.parentId === id) stack.push(c.id);
  }
  return [...out];
}

export function bucketForCategory(cat: LedgerCategory): Bucket {
  if (cat.kind === 'investment') return 'savings';
  if (cat.slug === 'debt-payments' || cat.slug.startsWith('debt')) return 'debt';
  return cat.necessity === 'essential' ? 'needs' : 'wants';
}

/**
 * Warnings are factual, never judgemental (spec §6): they state a number and a time
 * remaining, and let the user draw the conclusion.
 */
function buildWarnings(lines: readonly BudgetLineStatus[], daysRemaining: number): BudgetWarning[] {
  const out: BudgetWarning[] = [];
  for (const line of lines) {
    if (line.targetMinor <= 0n) continue;
    const pct = Math.round(line.consumedFraction * 100);

    if (line.status === 'over') {
      out.push({
        key: `over:${line.key}`,
        severity: 'attention',
        categoryId: line.categoryId,
        message: `${line.label} is at ${pct}% of its budget with ${dayWord(daysRemaining)} remaining.`,
      });
    } else if (line.status === 'approaching' && pct >= 75) {
      out.push({
        key: `approaching:${line.key}`,
        severity: 'notice',
        categoryId: line.categoryId,
        message: `You have used ${pct}% of your ${line.label.toLowerCase()} budget with ${dayWord(daysRemaining)} remaining.`,
      });
    } else if (line.projectedOverageMinor > 0n && daysRemaining > 3) {
      out.push({
        key: `projected:${line.key}`,
        severity: 'info',
        categoryId: line.categoryId,
        message: `At the current rate, ${line.label.toLowerCase()} is on pace to finish the period over budget.`,
      });
    }
  }
  return out;
}

function dayWord(days: number): string {
  if (days <= 0) return 'no days';
  return days === 1 ? '1 day' : `${days} days`;
}

/* ------------------------------------------------------------------ */
/* Suggested targets from history                                      */
/* ------------------------------------------------------------------ */

/**
 * Prefill a new budget from what the user actually spends. A budget built from real
 * averages gets used; one built from guesses gets abandoned in a week.
 */
export function suggestTargetsFromHistory(
  txns: readonly LedgerTxn[],
  range: DateRange,
  months: number,
): Map<string, bigint> {
  const totals = spendingByCategory(txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end));
  const divisor = BigInt(Math.max(1, months));
  const out = new Map<string, bigint>();
  for (const t of totals) {
    if (!t.categoryId) continue;
    // Round up to the nearest $5 so the number looks like a decision, not a datum.
    const avg = absMinor(t.amountMinor) / divisor;
    const rounded = ((avg + 499n) / 500n) * 500n;
    out.set(t.categoryId, rounded);
  }
  return out;
}

export const ZERO_BASED_TOLERANCE_MINOR = 100n;

/** Is a zero-based budget actually balanced? */
export function zeroBasedRemainder(budget: BudgetInput, incomeMinor: bigint): bigint {
  const income = budget.expectedIncomeMinor ?? incomeMinor;
  const assigned = sumMinor(
    budget.allocations.map((a) => a.amountMinor ?? (a.percentBps !== null ? applyBps(income, a.percentBps) : 0n)),
  );
  return income - assigned;
}

/** Percentage budgets must add to 100%. */
export function percentageRemainderBps(budget: BudgetInput): number {
  const total = budget.allocations.reduce((sum, a) => sum + (a.percentBps ?? 0), 0);
  return 10_000 - total;
}

export function rangeDays(range: DateRange): number {
  return rangeLengthDays(range);
}

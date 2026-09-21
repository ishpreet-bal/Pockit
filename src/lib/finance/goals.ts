/**
 * Goals — forward maths, reverse maths, and feasibility (spec §7, §8).
 *
 * The important part is §8: dividing a remaining balance by months left is trivial
 * and useless on its own. What makes a goal actionable is comparing that requirement
 * against the cash flow the user actually has, and then generating adjustments from
 * their OWN largest discretionary categories rather than generic advice.
 *
 * Nothing here is presented as financial advice; every projection states its
 * assumptions and is labelled as an estimate.
 */
import { mulRatio, sumMinor, absMinor } from '@/lib/money';
import type { DateRange, IsoDate, LedgerTxn, LedgerCategory } from './types';
import { addMonths, diffDays, diffMonths, todayIn } from './period';
import { periodTotals, spendingByCategory } from './ledger';

export interface GoalInput {
  id: string;
  name: string;
  targetMinor: bigint;
  currentMinor: bigint;
  targetDate: IsoDate | null;
  priority: number;
  monthlyContributionMinor: bigint | null;
}

export interface GoalMath {
  remainingMinor: bigint;
  progressFraction: number;
  isAchieved: boolean;
  daysRemaining: number | null;
  monthsRemaining: number | null;
  /** Required contribution to hit the target date. Null when there is no target date. */
  requiredMonthlyMinor: bigint | null;
  requiredBiweeklyMinor: bigint | null;
  requiredWeeklyMinor: bigint | null;
  /** Reverse: at the stated contribution, when does it complete? */
  projectedCompletionDate: IsoDate | null;
  projectedMonths: number | null;
  /** Ahead of or behind the pace implied by the target date, in months. */
  scheduleVarianceMonths: number | null;
}

/**
 * Forward and reverse goal maths.
 *
 * Both directions are computed together because the UI always shows both: "you need
 * $1,250/month" and "at $1,000/month you finish in March" answer different questions
 * about the same goal.
 */
export function computeGoalMath(goal: GoalInput, today: IsoDate): GoalMath {
  const remaining = goal.targetMinor - goal.currentMinor;
  const isAchieved = remaining <= 0n;
  const progressFraction = goal.targetMinor > 0n
    ? Math.min(1, Number(goal.currentMinor) / Number(goal.targetMinor))
    : 0;

  let daysRemaining: number | null = null;
  let monthsRemaining: number | null = null;
  let requiredMonthly: bigint | null = null;
  let requiredBiweekly: bigint | null = null;
  let requiredWeekly: bigint | null = null;

  if (goal.targetDate) {
    daysRemaining = diffDays(today, goal.targetDate);
    monthsRemaining = Math.max(0, diffMonths(today, goal.targetDate));

    if (!isAchieved) {
      // Use the larger of whole months and a day-derived fraction so a 20-day goal
      // does not report "0 months" and then divide by zero.
      const effectiveMonths = Math.max(monthsRemaining, daysRemaining > 0 ? daysRemaining / 30.44 : 0);
      if (effectiveMonths > 0) {
        requiredMonthly = mulRatio(remaining, 1000n, BigInt(Math.round(effectiveMonths * 1000)));
        const weeks = daysRemaining / 7;
        requiredWeekly = weeks > 0 ? mulRatio(remaining, 1000n, BigInt(Math.round(weeks * 1000))) : remaining;
        requiredBiweekly = weeks > 0 ? mulRatio(remaining, 2000n, BigInt(Math.round(weeks * 1000))) : remaining;
      } else {
        // Target date is today or past: the whole remainder is due now.
        requiredMonthly = remaining;
        requiredBiweekly = remaining;
        requiredWeekly = remaining;
      }
    }
  }

  let projectedCompletionDate: IsoDate | null = null;
  let projectedMonths: number | null = null;
  const contribution = goal.monthlyContributionMinor;
  if (!isAchieved && contribution && contribution > 0n) {
    projectedMonths = Math.ceil(Number(remaining) / Number(contribution));
    projectedCompletionDate = addMonths(today, projectedMonths);
  } else if (isAchieved) {
    projectedMonths = 0;
    projectedCompletionDate = today;
  }

  const scheduleVarianceMonths =
    monthsRemaining !== null && projectedMonths !== null ? monthsRemaining - projectedMonths : null;

  return {
    remainingMinor: remaining > 0n ? remaining : 0n,
    progressFraction,
    isAchieved,
    daysRemaining,
    monthsRemaining,
    requiredMonthlyMinor: requiredMonthly,
    requiredBiweeklyMinor: requiredBiweekly,
    requiredWeeklyMinor: requiredWeekly,
    projectedCompletionDate,
    projectedMonths,
    scheduleVarianceMonths,
  };
}

/**
 * What a chosen timeline costs per period.
 *
 * Extracted so the timeline slider on a goal card cannot drift from the figures the
 * goal card itself already shows: dragging to exactly the goal's own number of months
 * must reproduce its stated monthly amount, or the slider is lying.
 *
 * Weeks are derived from months at 30.44/7 for the same reason the main calculation
 * does — twelve four-week months is ten months of the year, not twelve.
 */
export function contributionForMonths(remainingMinor: bigint, months: number): {
  monthlyMinor: bigint;
  biweeklyMinor: bigint;
  weeklyMinor: bigint;
} {
  if (remainingMinor <= 0n || months <= 0) {
    return { monthlyMinor: 0n, biweeklyMinor: 0n, weeklyMinor: 0n };
  }
  const thousandths = BigInt(Math.round(months * 1000));
  const weeks = (months * 30.44) / 7;
  const weekThousandths = BigInt(Math.round(weeks * 1000));
  return {
    monthlyMinor: mulRatio(remainingMinor, 1000n, thousandths),
    biweeklyMinor: mulRatio(remainingMinor, 2000n, weekThousandths),
    weeklyMinor: mulRatio(remainingMinor, 1000n, weekThousandths),
  };
}

/** Reverse calculation: "I can save $X/month — when do I get there?" */
export function projectCompletion(
  remainingMinor: bigint,
  monthlyContributionMinor: bigint,
  today: IsoDate,
): { months: number; date: IsoDate } | null {
  if (monthlyContributionMinor <= 0n) return null;
  if (remainingMinor <= 0n) return { months: 0, date: today };
  const months = Math.ceil(Number(remainingMinor) / Number(monthlyContributionMinor));
  return { months, date: addMonths(today, months) };
}

/* ------------------------------------------------------------------ */
/* Feasibility (spec §8)                                               */
/* ------------------------------------------------------------------ */

export interface CashFlowBasis {
  months: number;
  averageIncomeMinor: bigint;
  averageExpensesMinor: bigint;
  availableMinor: bigint;
  range: DateRange;
}

/** Trailing average income and expenses, the basis for every feasibility statement. */
export function computeCashFlowBasis(
  txns: readonly LedgerTxn[],
  range: DateRange,
  months: number,
): CashFlowBasis {
  const inRange = txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);
  const totals = periodTotals(inRange);
  const divisor = BigInt(Math.max(1, months));
  const avgIncome = totals.income / divisor;
  const avgExpenses = totals.expenses / divisor;
  return {
    months,
    averageIncomeMinor: avgIncome,
    averageExpensesMinor: avgExpenses,
    availableMinor: avgIncome - avgExpenses,
    range,
  };
}

export interface GoalAdjustment {
  categoryId: string;
  categoryName: string;
  currentMonthlyMinor: bigint;
  suggestedReductionMinor: bigint;
  reductionFraction: number;
}

export interface GoalFeasibility {
  feasible: boolean;
  requiredMonthlyMinor: bigint;
  availableMinor: bigint;
  /** Positive when the goal needs more than is currently available. */
  shortfallMinor: bigint;
  basis: CashFlowBasis;
  /** Plain-language explanation stating its own assumptions. */
  explanation: string;
  /** Concrete adjustments drawn from the user's own discretionary spending. */
  adjustments: GoalAdjustment[];
  adjustedAvailableMinor: bigint;
  /** If not feasible at the target date, the date it IS achievable at current capacity. */
  achievableDate: IsoDate | null;
}

/**
 * Compare what the goal needs against what the user's cash flow actually provides,
 * and if there is a gap, propose reductions from their largest discretionary
 * categories — capped at 30% of each, because a suggestion to cut a category by 80%
 * is not a suggestion anyone acts on.
 */
export function assessFeasibility(
  goal: GoalInput,
  math: GoalMath,
  basis: CashFlowBasis,
  txns: readonly LedgerTxn[],
  categories: readonly LedgerCategory[],
  today: IsoDate,
  otherGoalCommitmentsMinor: bigint = 0n,
): GoalFeasibility {
  const required = math.requiredMonthlyMinor ?? goal.monthlyContributionMinor ?? 0n;
  const available = basis.availableMinor - otherGoalCommitmentsMinor;
  const shortfall = required - available;
  const feasible = shortfall <= 0n;

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const adjustments: GoalAdjustment[] = [];
  let recovered = 0n;

  if (!feasible && shortfall > 0n) {
    const spend = spendingByCategory(
      txns.filter((t) => t.postedDate >= basis.range.start && t.postedDate <= basis.range.end),
    );
    const divisor = BigInt(Math.max(1, basis.months));

    const discretionary = spend
      .filter((s) => {
        const cat = s.categoryId ? categoryById.get(s.categoryId) : undefined;
        return cat?.necessity === 'discretionary' && s.amountMinor > 0n;
      })
      .sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : -1));

    for (const entry of discretionary) {
      if (recovered >= shortfall) break;
      const cat = categoryById.get(entry.categoryId!);
      if (!cat) continue;
      const monthly = absMinor(entry.amountMinor) / divisor;
      if (monthly < 1_000n) continue; // ignore categories under $10/month — noise
      const maxCut = mulRatio(monthly, 30n, 100n);
      const stillNeeded = shortfall - recovered;
      const cut = maxCut < stillNeeded ? maxCut : stillNeeded;
      // Round to the nearest $5 so the suggestion reads as a decision.
      const rounded = ((cut + 249n) / 500n) * 500n;
      if (rounded <= 0n) continue;
      adjustments.push({
        categoryId: cat.id,
        categoryName: cat.name,
        currentMonthlyMinor: monthly,
        suggestedReductionMinor: rounded,
        reductionFraction: monthly > 0n ? Number(rounded) / Number(monthly) : 0,
      });
      recovered += rounded;
    }
  }

  const achievableDate =
    !feasible && available > 0n
      ? projectCompletion(math.remainingMinor, available, today)?.date ?? null
      : null;

  return {
    feasible,
    requiredMonthlyMinor: required,
    availableMinor: available,
    shortfallMinor: shortfall > 0n ? shortfall : 0n,
    basis,
    explanation: buildExplanation(feasible, shortfall, basis, required, available),
    adjustments,
    adjustedAvailableMinor: available + recovered,
    achievableDate,
  };
}

function buildExplanation(
  feasible: boolean,
  shortfall: bigint,
  basis: CashFlowBasis,
  required: bigint,
  /**
   * Spare cash AFTER other goals are funded, which is what the shortfall was
   * measured against. Quoting the gross figure here instead made the sentence fail
   * its own arithmetic: "$593 more per month than your available $1,090" for a goal
   * needing $433 is not a sum anyone can follow.
   */
  available: bigint,
): string {
  const window = `your last ${basis.months} month${basis.months === 1 ? '' : 's'}`;
  if (required <= 0n) {
    return `This goal has no target date, so there is no required monthly amount to check against your cash flow.`;
  }
  const net = available === basis.availableMinor
    ? ''
    : ` (after what your other goals already claim)`;
  if (feasible) {
    return `Based on ${window}, you have about ${fmt(available)} a month spare${net}, which covers the ${fmt(required)} this goal needs. This is an estimate from past activity, not a guarantee of future cash flow.`;
  }
  return `Based on ${window}, this goal needs ${fmt(required)} a month but you have about ${fmt(available)} spare${net} — a gap of ${fmt(shortfall)}. This is an estimate from past activity, not financial advice.`;
}

function fmt(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  const dollars = abs / 100n;
  const cents = abs % 100n;
  const sign = minor < 0n ? '-' : '';
  const body = cents === 0n ? dollars.toString() : `${dollars}.${cents.toString().padStart(2, '0')}`;
  return `${sign}$${body.replace(/\B(?=(\d{3})+(?!\d))/, ',')}`;
}

/* ------------------------------------------------------------------ */
/* Portfolio view across goals                                         */
/* ------------------------------------------------------------------ */

export interface GoalPortfolio {
  totalTargetMinor: bigint;
  totalSavedMinor: bigint;
  totalRequiredMonthlyMinor: bigint;
  overallProgressFraction: number;
  /** True when the sum of all goals' requirements exceeds available cash flow. */
  overcommitted: boolean;
  availableMinor: bigint;
}

export function summarizeGoals(
  goals: readonly GoalInput[],
  basis: CashFlowBasis,
  today: IsoDate,
): GoalPortfolio {
  const active = goals.filter((g) => g.currentMinor < g.targetMinor);
  const required = sumMinor(
    active.map((g) => computeGoalMath(g, today).requiredMonthlyMinor ?? g.monthlyContributionMinor ?? 0n),
  );
  const totalTarget = sumMinor(goals.map((g) => g.targetMinor));
  const totalSaved = sumMinor(goals.map((g) => g.currentMinor));
  return {
    totalTargetMinor: totalTarget,
    totalSavedMinor: totalSaved,
    totalRequiredMonthlyMinor: required,
    overallProgressFraction: totalTarget > 0n ? Math.min(1, Number(totalSaved) / Number(totalTarget)) : 0,
    overcommitted: required > basis.availableMinor,
    availableMinor: basis.availableMinor,
  };
}

export { todayIn };


/* ------------------------------------------------------------------ */
/* Pace: is this goal actually moving?                                 */
/* ------------------------------------------------------------------ */

export interface GoalPace {
  /** What the user has actually been putting in, from real contributions. */
  observedMonthlyMinor: bigint;
  /** When the goal completes at that observed pace. */
  projectedDate: IsoDate | null;
  projectedMonths: number | null;
  /** Positive = ahead of the target date, negative = behind. */
  monthsAheadOfTarget: number | null;
  status: 'ahead' | 'on_track' | 'behind' | 'stalled' | 'achieved' | 'no_target';
  /** One sentence the user can act on, or null when there is nothing worth saying. */
  headline: string;
  /** An optional, concrete suggestion. Never presented as advice. */
  suggestion: { text: string; extraMonthlyMinor: bigint; monthsSaved: number } | null;
}

/**
 * Compare a goal against what is really happening.
 *
 * A goal that only shows a target and a percentage is inert. What makes it useful is
 * the gap between the pace it needs and the pace it is actually getting — and, when
 * there is a gap, what closing it would take.
 */
export function computeGoalPace(
  goal: GoalInput,
  math: GoalMath,
  observedMonthlyMinor: bigint,
  today: IsoDate,
  currency: string,
): GoalPace {
  if (math.isAchieved) {
    return {
      observedMonthlyMinor, projectedDate: today, projectedMonths: 0,
      monthsAheadOfTarget: null, status: 'achieved',
      headline: 'Reached. Nice work.', suggestion: null,
    };
  }

  const pace = observedMonthlyMinor > 0n ? observedMonthlyMinor : (goal.monthlyContributionMinor ?? 0n);
  const projection = pace > 0n ? projectCompletion(math.remainingMinor, pace, today) : null;

  if (!projection) {
    return {
      observedMonthlyMinor, projectedDate: null, projectedMonths: null,
      monthsAheadOfTarget: null, status: 'stalled',
      headline: `Nothing has gone in yet. ${
        math.requiredMonthlyMinor !== null
          ? `Putting ${money(math.requiredMonthlyMinor, currency)} aside each month would reach it by ${goal.targetDate}.`
          : 'Set a monthly amount and Pockit can project when you will get there.'
      }`,
      suggestion: null,
    };
  }

  if (math.monthsRemaining === null) {
    return {
      observedMonthlyMinor, projectedDate: projection.date, projectedMonths: projection.months,
      monthsAheadOfTarget: null, status: 'no_target',
      headline: `At ${money(pace, currency)} a month you will get there around ${projection.date}.`,
      suggestion: null,
    };
  }

  const monthsAhead = math.monthsRemaining - projection.months;
  const status: GoalPace['status'] =
    monthsAhead >= 1 ? 'ahead' : monthsAhead <= -1 ? 'behind' : 'on_track';

  let headline: string;
  if (status === 'ahead') {
    headline = `Ahead of schedule — about ${monthsAhead} month${monthsAhead === 1 ? '' : 's'} early at your current pace.`;
  } else if (status === 'behind') {
    const short = Math.abs(monthsAhead);
    headline = `Running about ${short} month${short === 1 ? '' : 's'} late at ${money(pace, currency)} a month.`;
  } else {
    headline = `On track at ${money(pace, currency)} a month.`;
  }

  // A concrete, optional suggestion — only when it would actually change something.
  let suggestion: GoalPace['suggestion'] = null;
  if (status !== 'ahead' && math.requiredMonthlyMinor !== null && math.requiredMonthlyMinor > pace) {
    const extra = math.requiredMonthlyMinor - pace;
    const faster = projectCompletion(math.remainingMinor, math.requiredMonthlyMinor, today);
    const saved = faster ? projection.months - faster.months : 0;
    if (saved > 0) {
      suggestion = {
        text: `Adding ${money(extra, currency)} a month would bring this forward by about ${saved} month${saved === 1 ? '' : 's'}.`,
        extraMonthlyMinor: extra,
        monthsSaved: saved,
      };
    }
  }

  return {
    observedMonthlyMinor, projectedDate: projection.date, projectedMonths: projection.months,
    monthsAheadOfTarget: monthsAhead, status, headline, suggestion,
  };
}

function money(minor: bigint, currency: string): string {
  const symbol = currency === 'EUR' ? '\u20ac' : currency === 'GBP' ? '\u00a3' : '$';
  const abs = minor < 0n ? -minor : minor;
  const dollars = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = abs % 100n;
  return `${minor < 0n ? '\u2212' : ''}${symbol}${dollars}${cents === 0n ? '' : `.${cents.toString().padStart(2, '0')}`}`;
}

/** Average monthly contribution actually observed, from recorded contributions. */
export function observedMonthlyContribution(
  contributions: readonly { occurredOn: IsoDate; amountMinor: bigint }[],
  months: number,
): bigint {
  if (contributions.length === 0 || months <= 0) return 0n;
  const total = contributions.reduce((s, c) => s + c.amountMinor, 0n);
  return total / BigInt(Math.max(1, months));
}

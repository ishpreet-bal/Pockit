/**
 * Scenario planning (spec §37) and paycheck allocation (spec §15).
 *
 * Scenarios apply deltas to a baseline and re-run the SAME engine functions the rest
 * of the app uses. They never re-derive the maths — that is what keeps a what-if
 * answer consistent with the dashboard it is compared against.
 */
import { sumMinor, mulRatio, absMinor, allocate } from '@/lib/money';
import type { IsoDate } from './types';
import { addMonths } from './period';
import { simulatePayoff, type DebtInput, type PayoffStrategy } from './debt';
import { projectCompletion } from './goals';

export type ScenarioChangeKind =
  | 'save_more' | 'income_change' | 'category_change' | 'one_time_purchase'
  | 'debt_payment_change' | 'business_revenue_change';

export interface ScenarioChange {
  kind: ScenarioChangeKind;
  label: string;
  /** Monthly delta in minor units. Negative reduces spending or income. */
  monthlyDeltaMinor?: bigint;
  /** One-off amount, for a purchase. */
  oneTimeMinor?: bigint;
  /** For category changes: a proportional cut instead of an absolute one. */
  percentBps?: number;
  categoryId?: string | null;
}

export interface ScenarioBaseline {
  monthlyIncomeMinor: bigint;
  monthlyExpensesMinor: bigint;
  monthlySavingsMinor: bigint;
  currentCashMinor: bigint;
  netWorthMinor: bigint;
  goals: { id: string; name: string; remainingMinor: bigint; monthlyContributionMinor: bigint }[];
  debts: readonly DebtInput[];
  debtBudgetMinor: bigint;
}

export interface ScenarioResult {
  changes: ScenarioChange[];
  before: ScenarioSnapshot;
  after: ScenarioSnapshot;
  goalImpacts: {
    id: string; name: string;
    beforeMonths: number | null; afterMonths: number | null;
    beforeDate: IsoDate | null; afterDate: IsoDate | null;
    monthsSaved: number | null;
  }[];
  debtImpact: {
    beforeMonths: number; afterMonths: number;
    beforeInterestMinor: bigint; afterInterestMinor: bigint;
    monthsSaved: number; interestSavedMinor: bigint;
  } | null;
  assumptions: string[];
}

export interface ScenarioSnapshot {
  monthlyIncomeMinor: bigint;
  monthlyExpensesMinor: bigint;
  monthlyCashFlowMinor: bigint;
  monthlySavingsMinor: bigint;
  savingsRateBps: number;
  cashIn12MonthsMinor: bigint;
  netWorthIn12MonthsMinor: bigint;
}

export function runScenario(
  baseline: ScenarioBaseline,
  changes: readonly ScenarioChange[],
  today: IsoDate,
): ScenarioResult {
  let income = baseline.monthlyIncomeMinor;
  let expenses = baseline.monthlyExpensesMinor;
  let savings = baseline.monthlySavingsMinor;
  let oneTime = 0n;
  let debtBudget = baseline.debtBudgetMinor;

  for (const change of changes) {
    switch (change.kind) {
      case 'income_change':
      case 'business_revenue_change':
        income += change.monthlyDeltaMinor ?? 0n;
        break;
      case 'category_change':
        expenses += change.percentBps !== undefined
          ? -mulRatio(expenses, BigInt(change.percentBps), 10_000n)
          : (change.monthlyDeltaMinor ?? 0n);
        break;
      case 'save_more':
        savings += change.monthlyDeltaMinor ?? 0n;
        break;
      case 'one_time_purchase':
        oneTime += change.oneTimeMinor ?? 0n;
        break;
      case 'debt_payment_change':
        debtBudget += change.monthlyDeltaMinor ?? 0n;
        break;
    }
  }

  const before = snapshot(baseline.monthlyIncomeMinor, baseline.monthlyExpensesMinor, baseline.monthlySavingsMinor, baseline.currentCashMinor, baseline.netWorthMinor, 0n);
  const after = snapshot(income, expenses, savings, baseline.currentCashMinor, baseline.netWorthMinor, oneTime);

  const beforeAvailable = baseline.monthlyIncomeMinor - baseline.monthlyExpensesMinor;
  const afterAvailable = income - expenses;

  const goalImpacts = baseline.goals.map((g) => {
    // Scale each goal's contribution by how the overall available cash flow moved,
    // which is the honest reading of "I save $500 more" across several goals.
    const scaled = beforeAvailable > 0n
      ? mulRatio(g.monthlyContributionMinor, afterAvailable > 0n ? afterAvailable : 0n, beforeAvailable)
      : g.monthlyContributionMinor + (afterAvailable - beforeAvailable);
    const beforeProj = projectCompletion(g.remainingMinor, g.monthlyContributionMinor, today);
    const afterProj = projectCompletion(g.remainingMinor, scaled > 0n ? scaled : 0n, today);
    return {
      id: g.id,
      name: g.name,
      beforeMonths: beforeProj?.months ?? null,
      afterMonths: afterProj?.months ?? null,
      beforeDate: beforeProj?.date ?? null,
      afterDate: afterProj?.date ?? null,
      monthsSaved: beforeProj && afterProj ? beforeProj.months - afterProj.months : null,
    };
  });

  let debtImpact: ScenarioResult['debtImpact'] = null;
  if (baseline.debts.length > 0 && baseline.debtBudgetMinor > 0n) {
    const strategy: PayoffStrategy = 'avalanche';
    const beforeSim = simulatePayoff(baseline.debts, baseline.debtBudgetMinor, strategy, today);
    const afterSim = simulatePayoff(baseline.debts, debtBudget, strategy, today);
    debtImpact = {
      beforeMonths: beforeSim.months,
      afterMonths: afterSim.months,
      beforeInterestMinor: beforeSim.totalInterestMinor,
      afterInterestMinor: afterSim.totalInterestMinor,
      monthsSaved: beforeSim.months - afterSim.months,
      interestSavedMinor: beforeSim.totalInterestMinor - afterSim.totalInterestMinor,
    };
  }

  return {
    changes: [...changes],
    before,
    after,
    goalImpacts,
    debtImpact,
    assumptions: [
      'Projections hold your income and spending steady at the adjusted levels for 12 months.',
      'Goal timelines assume contributions scale with your available cash flow.',
      'Investment growth, inflation and tax are not modelled.',
      'This is a projection from your own records, not financial advice.',
    ],
  };
}

function snapshot(
  income: bigint, expenses: bigint, savings: bigint,
  currentCash: bigint, netWorth: bigint, oneTime: bigint,
): ScenarioSnapshot {
  const cashFlow = income - expenses;
  return {
    monthlyIncomeMinor: income,
    monthlyExpensesMinor: expenses,
    monthlyCashFlowMinor: cashFlow,
    monthlySavingsMinor: savings,
    savingsRateBps: income > 0n ? Number(mulRatio(cashFlow, 10_000n, income)) : 0,
    cashIn12MonthsMinor: currentCash + cashFlow * 12n - oneTime,
    netWorthIn12MonthsMinor: netWorth + cashFlow * 12n - oneTime,
  };
}

/* ------------------------------------------------------------------ */
/* Paycheck planning (spec §15)                                        */
/* ------------------------------------------------------------------ */

export type IncomeSchedule = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'irregular';

export const PAYCHECKS_PER_YEAR: Record<Exclude<IncomeSchedule, 'irregular'>, number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
};

export interface AllocationRule {
  id: string;
  label: string;
  /** Either a fixed amount per paycheck or a share of it. Fixed wins when both are set. */
  amountMinor: bigint | null;
  percentBps: number | null;
  categoryId: string | null;
  priority: number;
}

export interface PaycheckPlan {
  paycheckMinor: bigint;
  lines: { id: string; label: string; amountMinor: bigint; basis: string; shareBps: number }[];
  allocatedMinor: bigint;
  remainingMinor: bigint;
  /** True when fixed amounts alone exceed the paycheck. */
  overAllocated: boolean;
}

/**
 * Allocate a paycheck across the user's rules.
 * Fixed amounts are taken first in priority order; percentages then apply to what is
 * left, and the residue becomes flexible spending. Allocation uses `allocate()` so
 * the lines sum back to the paycheck exactly.
 */
export function planPaycheck(paycheckMinor: bigint, rules: readonly AllocationRule[]): PaycheckPlan {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const lines: PaycheckPlan['lines'] = [];
  let remaining = paycheckMinor;

  for (const rule of sorted) {
    if (rule.amountMinor === null) continue;
    const amount = rule.amountMinor > remaining ? (remaining > 0n ? remaining : 0n) : rule.amountMinor;
    lines.push({
      id: rule.id,
      label: rule.label,
      amountMinor: amount,
      basis: amount < rule.amountMinor ? 'Fixed amount (reduced — paycheck was short)' : 'Fixed amount',
      shareBps: paycheckMinor > 0n ? Number(mulRatio(amount, 10_000n, paycheckMinor)) : 0,
    });
    remaining -= amount;
  }

  const percentRules = sorted.filter((r) => r.amountMinor === null && r.percentBps !== null);
  if (percentRules.length > 0 && remaining > 0n) {
    const totalBps = percentRules.reduce((s, r) => s + (r.percentBps ?? 0), 0);
    // If the percentages exceed 100 they are treated as relative weights rather than
    // silently over-allocating the remainder.
    const base = totalBps > 10_000 ? remaining : mulRatio(remaining, BigInt(Math.min(totalBps, 10_000)), 10_000n);
    const shares = allocate(base, percentRules.map((r) => r.percentBps ?? 0));
    percentRules.forEach((rule, i) => {
      const amount = shares[i] ?? 0n;
      lines.push({
        id: rule.id,
        label: rule.label,
        amountMinor: amount,
        basis: `${((rule.percentBps ?? 0) / 100).toFixed(1)}% of what remains`,
        shareBps: paycheckMinor > 0n ? Number(mulRatio(amount, 10_000n, paycheckMinor)) : 0,
      });
    });
    remaining -= sumMinor(shares);
  }

  const allocated = sumMinor(lines.map((l) => l.amountMinor));
  return {
    paycheckMinor,
    lines,
    allocatedMinor: allocated,
    remainingMinor: paycheckMinor - allocated,
    overAllocated: allocated > paycheckMinor,
  };
}

/** Monthly equivalent of a per-paycheck amount. */
export function paycheckToMonthly(amountMinor: bigint, schedule: IncomeSchedule): bigint {
  if (schedule === 'irregular') return amountMinor;
  return mulRatio(amountMinor, BigInt(PAYCHECKS_PER_YEAR[schedule]), 12n);
}

export function monthlyToPaycheck(amountMinor: bigint, schedule: IncomeSchedule): bigint {
  if (schedule === 'irregular') return amountMinor;
  return mulRatio(amountMinor, 12n, BigInt(PAYCHECKS_PER_YEAR[schedule]));
}

/** Upcoming paydays from an anchor date. */
export function upcomingPaydays(
  anchor: IsoDate, schedule: IncomeSchedule, from: IsoDate, through: IsoDate,
): IsoDate[] {
  if (schedule === 'irregular') return [];
  const out: IsoDate[] = [];
  let cursor = anchor;
  let guard = 0;
  while (cursor < from && guard++ < 500) cursor = nextPayday(cursor, schedule);
  guard = 0;
  while (cursor <= through && guard++ < 500) {
    out.push(cursor);
    cursor = nextPayday(cursor, schedule);
  }
  return out;
}

function nextPayday(date: IsoDate, schedule: Exclude<IncomeSchedule, 'irregular'>): IsoDate {
  switch (schedule) {
    case 'weekly': return shiftDays(date, 7);
    case 'biweekly': return shiftDays(date, 14);
    case 'semimonthly': return shiftDays(date, 15);
    case 'monthly': return addMonths(date, 1);
  }
}

function shiftDays(date: IsoDate, days: number): IsoDate {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export { absMinor };

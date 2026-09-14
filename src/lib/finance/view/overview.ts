import 'server-only';
import { sumMinor, absMinor } from '@/lib/money';
import { WorkspaceRepo } from '@/lib/data/repository';
import {
  periodTotals, allAccountBalances, cashPosition, spendingByCategory, monthlySeries, rollUpCategories,
} from '@/lib/finance/ledger';
import { resolvePeriod, previousPeriod, todayIn, startOfMonth, endOfMonth, addMonths, type PeriodPreset } from '@/lib/finance/period';
import { detectRecurring, summarizeSubscriptions, upcomingOccurrences } from '@/lib/finance/recurring';
import { computeGoalMath, computeCashFlowBasis, type GoalInput } from '@/lib/finance/goals';
import { safeToSpend } from '@/lib/finance/forecast';
import { computeInsights } from '@/lib/finance/patterns';
import { computeNetWorth } from '@/lib/finance/networth';
import { evaluateBudget, type BudgetInput } from '@/lib/finance/budget';
import type { DateRange } from '@/lib/finance/types';

/**
 * Assembles everything the Overview needs in ONE pass over the ledger.
 *
 * The page component does no arithmetic at all — it only renders what this returns.
 * That is what keeps the dashboard's numbers identical to every other screen's.
 */
export async function buildOverview(
  repo: WorkspaceRepo,
  preset: PeriodPreset,
  timezone: string,
  custom?: Partial<DateRange>,
) {
  const today = todayIn(timezone);
  const range = resolvePeriod(preset, today, custom);
  const prevRange = previousPeriod(range);

  // A wide window so trailing averages, recurring detection and the chart all work.
  const historyStart = startOfMonth(addMonths(today, -11));
  const fullRange: DateRange = {
    start: range.start < historyStart ? range.start : historyStart,
    end: range.end > today ? range.end : today,
  };

  const [accounts, categories, allTxns, goalRows, budgetBundle, assets, liabilities] = await Promise.all([
    repo.listAccounts(),
    repo.listCategories(),
    repo.listTransactions({ range: fullRange }),
    repo.listGoals(),
    repo.getActiveBudget(),
    repo.listAssets(),
    repo.listLiabilities(),
  ]);

  const inPeriod = allTxns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);
  const inPrev = allTxns.filter((t) => t.postedDate >= prevRange.start && t.postedDate <= prevRange.end);

  const totals = periodTotals(inPeriod);
  const prevTotals = periodTotals(inPrev);

  const balances = allAccountBalances(accounts, allTxns, today);
  const cash = cashPosition(accounts, balances);

  const netWorth = computeNetWorth(
    accounts, balances,
    assets.map((a) => ({ id: a.id, name: a.name, category: a.category, valueMinor: BigInt(a.valueMinor as unknown as string), asOf: a.asOf, accountId: a.accountId })),
    liabilities.map((l) => ({ id: l.id, name: l.name, category: l.category, valueMinor: BigInt(l.balanceMinor as unknown as string), asOf: l.asOf, accountId: l.accountId })),
  );

  const leafSpend = spendingByCategory(inPeriod);
  const rolled = rollUpCategories(leafSpend, categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Top-level categories only, so the chart reads as "where did it go" not a list of leaves.
  const topCategories = categories
    .filter((c) => c.parentId === null && c.kind === 'expense')
    .map((c) => ({ category: c, amountMinor: rolled.get(c.id) ?? 0n }))
    .filter((c) => c.amountMinor > 0n)
    .sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : -1));

  const series = monthlySeries(allTxns, { start: historyStart, end: today });

  const detected = detectRecurring(allTxns, today);
  const subscriptions = summarizeSubscriptions(detected);
  const upcoming = upcomingOccurrences(detected, today, endOfMonth(today))
    .filter((u) => u.type !== 'income')
    .slice(0, 6);

  const basis = computeCashFlowBasis(allTxns, { start: startOfMonth(addMonths(today, -2)), end: today }, 3);

  const goals: GoalInput[] = goalRows.map((g) => ({
    id: g.id,
    name: g.name,
    targetMinor: BigInt(g.targetMinor as unknown as string),
    currentMinor: BigInt(g.currentMinor as unknown as string),
    targetDate: g.targetDate,
    priority: g.priority,
    monthlyContributionMinor: g.monthlyContributionMinor === null ? null : BigInt(g.monthlyContributionMinor as unknown as string),
  }));
  const goalStatus = goals
    .filter((g) => g.currentMinor < g.targetMinor)
    .map((g) => ({ goal: g, math: computeGoalMath(g, today) }))
    .sort((a, b) => a.goal.priority - b.goal.priority)
    .slice(0, 3);

  const monthlyGoalCommitment = sumMinor(goals.map((g) => g.monthlyContributionMinor ?? 0n));

  const sts = safeToSpend({
    availableCashMinor: cash.cashMinor,
    today,
    throughDate: endOfMonth(today),
    horizon: 'this_month',
    series: detected,
    monthlySavingsCommitmentMinor: monthlyGoalCommitment,
    monthlyInvestmentCommitmentMinor: 0n,
    historyTxns: allTxns,
    historyRange: { start: startOfMonth(addMonths(today, -2)), end: today },
    categories,
  });

  let budgetStatus = null;
  if (budgetBundle) {
    const budgetInput: BudgetInput = {
      id: budgetBundle.budget.id,
      name: budgetBundle.budget.name,
      method: budgetBundle.budget.method,
      period: budgetBundle.budget.period,
      periodStart: budgetBundle.budget.periodStart,
      periodDays: budgetBundle.budget.periodDays,
      expectedIncomeMinor: budgetBundle.budget.expectedIncomeMinor === null ? null : BigInt(budgetBundle.budget.expectedIncomeMinor as unknown as string),
      rollover: budgetBundle.budget.rollover,
      allocations: budgetBundle.allocations.map((a) => ({
        id: a.id,
        categoryId: a.categoryId,
        bucket: a.bucket,
        label: a.label,
        amountMinor: a.amountMinor === null ? null : BigInt(a.amountMinor as unknown as string),
        percentBps: a.percentBps,
      })),
    };
    budgetStatus = evaluateBudget(budgetInput, allTxns, categories, today);
  }

  const insights = computeInsights({
    currency: repo.baseCurrency,
    current: range,
    txns: allTxns,
    historyTxns: allTxns.filter((t) => t.postedDate < range.start),
    historyRange: { start: historyStart, end: range.start },
    categories,
  }).slice(0, 4);

  return {
    today,
    range,
    prevRange,
    preset,
    currency: repo.baseCurrency,
    totals,
    prevTotals,
    deltas: {
      income: totals.income - prevTotals.income,
      expenses: totals.expenses - prevTotals.expenses,
      net: totals.netCashFlow - prevTotals.netCashFlow,
    },
    cash,
    netWorth,
    accounts,
    balances,
    topCategories: topCategories.map((c) => ({
      id: c.category.id,
      name: c.category.name,
      color: c.category.color,
      icon: c.category.icon,
      amountMinor: c.amountMinor,
    })),
    series,
    subscriptions,
    upcoming,
    goalStatus,
    safeToSpend: sts,
    budgetStatus,
    insights,
    basis,
    transactionCount: inPeriod.length,
    recentTransactions: inPeriod.slice(0, 8).map((t) => ({
      id: t.id,
      date: t.postedDate,
      description: t.merchantName ?? t.description,
      amountMinor: t.baseAmountMinor,
      type: t.type,
      categoryName: t.categoryId ? categoryById.get(t.categoryId)?.name ?? null : null,
      categoryIcon: t.categoryId ? categoryById.get(t.categoryId)?.icon ?? null : null,
    })),
    hasData: allTxns.length > 0,
    absMinor,
  };
}

export type OverviewData = Awaited<ReturnType<typeof buildOverview>>;

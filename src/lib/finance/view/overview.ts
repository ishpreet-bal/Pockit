import 'server-only';
import { sumMinor, absMinor } from '@/lib/money';
import { WorkspaceRepo } from '@/lib/data/repository';
import { spendingByCategory, rollUpCategories, monthlySeries, periodTotals } from '@/lib/finance/ledger';
import { todayIn, startOfMonth, endOfMonth, addMonths, previousPeriod } from '@/lib/finance/period';
import { detectRecurring } from '@/lib/finance/recurring';
import { manualScheduleToSeries } from '@/lib/finance/schedule';
import { computePosition, explainAvailable, explainLeftThisPeriod, isScheduled } from '@/lib/finance/position';
import { computeGoalMath, type GoalInput } from '@/lib/finance/goals';
import { evaluateBudget, type BudgetInput } from '@/lib/finance/budget';
import { computeInsights } from '@/lib/finance/patterns';
import type { DateRange } from '@/lib/finance/types';

/**
 * Everything the Overview needs, in one pass.
 *
 * The dashboard answers four questions and nothing else:
 *   1. How much do I have available?
 *   2. Where has my money gone?
 *   3. What is coming?
 *   4. Am I on track?
 *
 * An earlier version showed fifteen cards at once. Depth still exists, but it lives on
 * the pages that specialise in it rather than competing for attention here.
 */
export async function buildOverview(repo: WorkspaceRepo, timezone: string, locale: string) {
  const today = todayIn(timezone);
  const period: DateRange = { start: startOfMonth(today), end: endOfMonth(today) };
  const historyStart = startOfMonth(addMonths(today, -5));

  const [accounts, categories, allTxns, goalRows, budgetBundle, manual] = await Promise.all([
    repo.listAccounts(),
    repo.listCategories(),
    repo.listTransactions(),
    repo.listGoals(),
    repo.getActiveBudget(),
    repo.listManualSchedules(),
  ]);

  // Manual schedules and detected ones are merged into a single list, so no downstream
  // calculation can treat "what the user told us" differently from "what we noticed".
  const detected = detectRecurring(
    allTxns, today, undefined, new Map(accounts.map((a) => [a.id, a.normalBalance])),
  );
  const series = [
    ...manual.filter((m) => m.isActive).map((m) => manualScheduleToSeries(m, today)),
    ...detected,
  ];

  const position = computePosition({
    txns: allTxns, accounts, categories, series, today,
    currency: repo.baseCurrency, period,
  });

  const available = explainAvailable(position);
  const leftThisPeriod = explainLeftThisPeriod(position);

  /* ---- where the money went ---- */
  const postedThisPeriod = allTxns.filter(
    (t) => t.postedDate >= period.start && t.postedDate <= period.end && !isScheduled(t, today),
  );
  const leafSpend = spendingByCategory(postedThisPeriod);
  const rolled = rollUpCategories(leafSpend, categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const topCategories = categories
    .filter((c) => c.parentId === null && c.kind === 'expense')
    .map((c) => ({ category: c, amountMinor: rolled.get(c.id) ?? 0n }))
    .filter((c) => c.amountMinor > 0n)
    .sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : -1))
    .slice(0, 6);

  const spendTotal = sumMinor(topCategories.map((c) => c.amountMinor));

  /* ---- comparison with last month, only when there is one ---- */
  const prev = previousPeriod(period);
  const prevTxns = allTxns.filter(
    (t) => t.postedDate >= prev.start && t.postedDate <= prev.end && !isScheduled(t, today),
  );
  const prevTotals = periodTotals(prevTxns);
  const hasPriorMonth = prevTxns.length > 0;

  /* ---- what is coming ---- */
  const upcoming = position.soonCommitments.filter((c) => c.kind !== 'income').slice(0, 5);
  const nextIncome = position.soonCommitments.find((c) => c.kind === 'income');

  /* ---- goals ---- */
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
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 2)
    .map((g) => ({ goal: g, math: computeGoalMath(g, today) }));

  /* ---- budget ---- */
  let budgetStatus = null;
  if (budgetBundle) {
    const budget: BudgetInput = {
      id: budgetBundle.budget.id,
      name: budgetBundle.budget.name,
      method: budgetBundle.budget.method,
      period: budgetBundle.budget.period,
      periodStart: budgetBundle.budget.periodStart,
      periodDays: budgetBundle.budget.periodDays,
      expectedIncomeMinor: budgetBundle.budget.expectedIncomeMinor === null ? null : BigInt(budgetBundle.budget.expectedIncomeMinor as unknown as string),
      rollover: budgetBundle.budget.rollover,
      allocations: budgetBundle.allocations.map((a) => ({
        id: a.id, categoryId: a.categoryId, bucket: a.bucket, label: a.label,
        amountMinor: a.amountMinor === null ? null : BigInt(a.amountMinor as unknown as string),
        percentBps: a.percentBps,
      })),
    };
    budgetStatus = evaluateBudget(budget, postedThisPeriod, categories, today, period);
  }

  /* ---- insights: only when they are actionable, never filler ---- */
  const insights = hasPriorMonth
    ? computeInsights({
        currency: repo.baseCurrency,
        current: period,
        txns: allTxns.filter((t) => !isScheduled(t, today)),
        historyTxns: allTxns.filter((t) => t.postedDate < period.start && !isScheduled(t, today)),
        historyRange: { start: historyStart, end: period.start },
        categories,
      }).slice(0, 3)
    : [];

  const series6 = monthlySeries(allTxns.filter((t) => !isScheduled(t, today)), { start: historyStart, end: today });

  return {
    today, period, locale,
    currency: repo.baseCurrency,
    position, available, leftThisPeriod,

    spent: position.spentMinor,
    spentDeltaMinor: hasPriorMonth ? position.spentMinor - prevTotals.expenses : null,
    incomeReceived: position.incomeReceivedMinor,
    incomeExpected: position.incomeExpectedMinor,

    topCategories: topCategories.map((c) => ({
      id: c.category.id,
      name: c.category.name,
      icon: c.category.icon,
      amountMinor: c.amountMinor,
      shareOfSpend: spendTotal > 0n ? Number((c.amountMinor * 100n) / spendTotal) : 0,
    })),
    spendTotal,

    upcoming,
    upcomingTotal: sumMinor(upcoming.map((u) => u.amountMinor)),
    commitmentCount: position.soonCommitments.filter((c) => c.kind !== 'income').length,
    nextIncome,

    goalStatus,
    budgetStatus,
    insights,
    series6,

    /* ---- how much the app actually knows, so it can behave accordingly ---- */
    hasTransactions: allTxns.length > 0,
    hasAccounts: accounts.length > 0,
    hasRecurring: series.length > 0,
    hasBudget: Boolean(budgetBundle),
    hasGoals: goals.length > 0,
    hasPriorMonth,

    // Transfers are excluded: moving money between your own accounts is neither
    // income nor spending, and both legs appearing makes it look like activity twice.
    recent: postedThisPeriod
      .filter((t) => t.type !== 'transfer' && t.type !== 'debt_payment')
      .slice(0, 5).map((t) => ({
      id: t.id,
      date: t.postedDate,
      description: t.merchantName ?? t.description,
      amountMinor: t.baseAmountMinor,
      type: t.type,
      categoryName: t.categoryId ? categoryById.get(t.categoryId)?.name ?? null : null,
      categoryIcon: t.categoryId ? categoryById.get(t.categoryId)?.icon ?? null : null,
    })),
    absMinor,
  };
}

export type OverviewData = Awaited<ReturnType<typeof buildOverview>>;

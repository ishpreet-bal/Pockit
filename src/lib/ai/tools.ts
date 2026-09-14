import 'server-only';
import { WorkspaceRepo } from '@/lib/data/repository';
import type { AssistantToolDefinition } from './types';
import { formatMoney, absMinor, sumMinor } from '@/lib/money';
import {
  periodTotals, spendingByCategory, spendingByMerchant, allAccountBalances,
  cashPosition, monthlySeries, countsAsSpending, spendingAmount,
} from '@/lib/finance/ledger';
import { resolvePeriod, previousPeriod, startOfMonth, addMonths, type PeriodPreset } from '@/lib/finance/period';
import { detectRecurring, summarizeSubscriptions } from '@/lib/finance/recurring';
import { computeGoalMath, computeCashFlowBasis } from '@/lib/finance/goals';
import { computeNetWorth } from '@/lib/finance/networth';
import type { DateRange, LedgerTxn, IsoDate } from '@/lib/finance/types';

/**
 * The assistant's tools (spec §22).
 *
 * Each tool runs a REAL query through the same finance engine every page uses, so an
 * answer can never disagree with the dashboard. The model chooses which tool to call
 * and with what filters; it does not produce the numbers.
 *
 * Every result includes a `drilldown` URL, so the user can open the exact set of
 * transactions a figure came from and check it.
 */
export function buildAssistantTools(
  repo: WorkspaceRepo,
  today: IsoDate,
  currency: string,
): AssistantToolDefinition[] {
  // The ledger is loaded once and shared across every tool call in a turn.
  let cache: { txns: LedgerTxn[]; loadedAt: number } | null = null;
  const load = async (): Promise<LedgerTxn[]> => {
    if (cache && Date.now() - cache.loadedAt < 60_000) return cache.txns;
    const txns = await repo.listTransactions();
    cache = { txns, loadedAt: Date.now() };
    return txns;
  };

  const resolveRange = (input: Record<string, unknown>): DateRange => {
    const period = (input.period as PeriodPreset) ?? 'this_month';
    if (period === 'custom' || input.startDate || input.endDate) {
      return {
        start: (input.startDate as string) ?? startOfMonth(today),
        end: (input.endDate as string) ?? today,
      };
    }
    return resolvePeriod(period, today);
  };

  const PERIOD_ENUM = [
    'this_week', 'this_month', 'last_month', 'last_3_months', 'last_6_months',
    'year_to_date', 'last_year', 'last_12_months', 'all_time', 'custom',
  ];

  const periodProperty = {
    period: { type: 'string', enum: PERIOD_ENUM, description: 'Named date range. Use "custom" with startDate/endDate for anything else.' },
    startDate: { type: 'string', description: 'YYYY-MM-DD, only with period "custom".' },
    endDate: { type: 'string', description: 'YYYY-MM-DD, only with period "custom".' },
  };

  return [
    {
      name: 'get_spending_summary',
      description:
        'Total income, expenses, net cash flow and savings rate for a period. Use this for "how much did I spend/earn/save". ' +
        'Transfers and credit-card payments are correctly excluded.',
      inputSchema: { type: 'object', properties: { ...periodProperty }, required: [] },
      async run(input) {
        const range = resolveRange(input);
        const txns = await load();
        const inRange = txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);
        const totals = periodTotals(inRange);
        const prev = periodTotals(txns.filter((t) => {
          const p = previousPeriod(range);
          return t.postedDate >= p.start && t.postedDate <= p.end;
        }));
        return {
          range,
          income: formatMoney(totals.income, currency),
          expenses: formatMoney(totals.expenses, currency),
          netCashFlow: formatMoney(totals.netCashFlow, currency),
          invested: formatMoney(totals.investments, currency),
          savingsRatePercent: Math.round(totals.savingsRateBps / 100),
          transactionCount: totals.transactionCount,
          transfersExcluded: totals.transferCount,
          previousPeriod: {
            income: formatMoney(prev.income, currency),
            expenses: formatMoney(prev.expenses, currency),
          },
          drilldown: `/transactions?period=${input.period ?? 'this_month'}`,
        };
      },
    },

    {
      name: 'get_spending_by_category',
      description:
        'Spending broken down by category for a period, largest first. Use this for "what did I spend on food" or "where did my money go".',
      inputSchema: {
        type: 'object',
        properties: {
          ...periodProperty,
          categoryName: { type: 'string', description: 'Filter to one category by name, e.g. "Groceries". Omit for all.' },
          limit: { type: 'number', description: 'How many categories to return. Default 12.' },
        },
        required: [],
      },
      async run(input) {
        const range = resolveRange(input);
        const [txns, categories] = await Promise.all([load(), repo.listCategories()]);
        const inRange = txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);
        const byId = new Map(categories.map((c) => [c.id, c]));
        const filterName = (input.categoryName as string | undefined)?.toLowerCase();

        let totals = spendingByCategory(inRange).map((entry) => ({
          category: entry.categoryId ? byId.get(entry.categoryId)?.name ?? 'Uncategorised' : 'Uncategorised',
          categoryId: entry.categoryId,
          amount: formatMoney(entry.amountMinor, currency),
          amountMinor: entry.amountMinor.toString(),
          transactionCount: entry.transactionCount,
        }));

        if (filterName) {
          totals = totals.filter((t) => t.category.toLowerCase().includes(filterName));
        }

        return {
          range,
          categories: totals.slice(0, (input.limit as number) ?? 12),
          drilldown: '/analytics',
        };
      },
    },

    {
      name: 'search_transactions',
      description:
        'Find individual transactions. Use for "show all Amazon purchases over $100" or "restaurants in August". ' +
        'Returns at most 40 rows plus the total of ALL matches.',
      inputSchema: {
        type: 'object',
        properties: {
          ...periodProperty,
          query: { type: 'string', description: 'Text to match against merchant, description or category.' },
          minAmount: { type: 'number', description: 'Minimum amount in major units, e.g. 100 for $100.' },
          maxAmount: { type: 'number', description: 'Maximum amount in major units.' },
          type: { type: 'string', enum: ['expense', 'income', 'transfer', 'refund', 'investment', 'debt_payment'] },
          businessOnly: { type: 'boolean', description: 'Only business-classified transactions.' },
        },
        required: [],
      },
      async run(input) {
        const range = resolveRange(input);
        const [txns, categories] = await Promise.all([load(), repo.listCategories()]);
        const byId = new Map(categories.map((c) => [c.id, c]));
        const q = (input.query as string | undefined)?.toLowerCase();
        const min = input.minAmount !== undefined ? BigInt(Math.round((input.minAmount as number) * 100)) : null;
        const max = input.maxAmount !== undefined ? BigInt(Math.round((input.maxAmount as number) * 100)) : null;

        const matches = txns.filter((t) => {
          if (t.postedDate < range.start || t.postedDate > range.end) return false;
          if (input.type && t.type !== input.type) return false;
          if (input.businessOnly && t.businessClassification !== 'business') return false;
          const magnitude = absMinor(t.baseAmountMinor);
          if (min !== null && magnitude < min) return false;
          if (max !== null && magnitude > max) return false;
          if (q) {
            const hay = `${t.description} ${t.merchantName ?? ''} ${t.categoryId ? byId.get(t.categoryId)?.name ?? '' : ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        const spendTotal = sumMinor(matches.filter(countsAsSpending).map(spendingAmount));

        return {
          range,
          matchCount: matches.length,
          totalSpending: formatMoney(spendTotal, currency),
          transactions: matches.slice(0, 40).map((t) => ({
            date: t.postedDate,
            description: t.merchantName ?? t.description,
            amount: formatMoney(absMinor(t.baseAmountMinor), currency),
            type: t.type,
            category: t.categoryId ? byId.get(t.categoryId)?.name ?? null : null,
          })),
          truncated: matches.length > 40,
          drilldown: `/transactions?q=${encodeURIComponent((input.query as string) ?? '')}`,
        };
      },
    },

    {
      name: 'get_subscriptions',
      description:
        'Detected recurring payments and subscriptions with monthly and annual totals, next expected date and any price increases.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      async run() {
        const txns = await load();
        const detected = detectRecurring(txns, today);
        const summary = summarizeSubscriptions(detected);
        return {
          monthlyTotal: formatMoney(summary.monthlyMinor, currency),
          annualTotal: formatMoney(summary.annualMinor, currency),
          count: summary.count,
          subscriptions: detected
            .filter((s) => s.kind === 'subscription' || s.kind === 'bill')
            .map((s) => ({
              name: s.name,
              amount: formatMoney(s.amountMinor, currency),
              cadence: s.cadence,
              nextExpected: s.nextExpectedDate,
              detectionConfidence: s.confidence,
              priceIncreases: s.priceChanges.map((c) => ({
                on: c.date,
                from: formatMoney(c.fromMinor, currency),
                to: formatMoney(c.toMinor, currency),
              })),
            })),
          drilldown: '/recurring',
        };
      },
    },

    {
      name: 'get_accounts_and_net_worth',
      description: 'Current balances for every account, total cash, total debt and net worth.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      async run() {
        const [accounts, txns, assets, liabilities] = await Promise.all([
          repo.listAccounts(), load(), repo.listAssets(), repo.listLiabilities(),
        ]);
        const balances = allAccountBalances(accounts, txns, today);
        const position = cashPosition(accounts, balances);
        const netWorth = computeNetWorth(
          accounts, balances,
          assets.map((a) => ({ id: a.id, name: a.name, category: a.category, valueMinor: BigInt(a.valueMinor as unknown as string), asOf: a.asOf, accountId: a.accountId })),
          liabilities.map((l) => ({ id: l.id, name: l.name, category: l.category, valueMinor: BigInt(l.balanceMinor as unknown as string), asOf: l.asOf, accountId: l.accountId })),
        );
        const byId = new Map(balances.map((b) => [b.accountId, b]));
        return {
          cash: formatMoney(position.cashMinor, currency),
          debt: formatMoney(position.debtMinor, currency),
          netWorth: formatMoney(netWorth.netMinor, currency),
          totalAssets: formatMoney(netWorth.assetsMinor, currency),
          accounts: accounts.map((a) => ({
            name: a.name,
            type: a.type,
            balance: formatMoney(byId.get(a.id)?.rawMinor ?? 0n, a.currency),
            isLiability: a.normalBalance === 'credit',
          })),
          drilldown: '/accounts',
        };
      },
    },

    {
      name: 'get_goals',
      description:
        'Financial goals with progress, required monthly saving and whether the target date is achievable given actual cash flow.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      async run() {
        const [rows, txns] = await Promise.all([repo.listGoals(), load()]);
        const basis = computeCashFlowBasis(txns, { start: startOfMonth(addMonths(today, -2)), end: today }, 3);
        return {
          availableMonthly: formatMoney(basis.availableMinor, currency),
          basisMonths: basis.months,
          goals: rows.map((g) => {
            const goal = {
              id: g.id, name: g.name,
              targetMinor: BigInt(g.targetMinor as unknown as string),
              currentMinor: BigInt(g.currentMinor as unknown as string),
              targetDate: g.targetDate, priority: g.priority,
              monthlyContributionMinor: g.monthlyContributionMinor === null ? null : BigInt(g.monthlyContributionMinor as unknown as string),
            };
            const math = computeGoalMath(goal, today);
            return {
              name: g.name,
              target: formatMoney(goal.targetMinor, currency),
              saved: formatMoney(goal.currentMinor, currency),
              remaining: formatMoney(math.remainingMinor, currency),
              progressPercent: Math.round(math.progressFraction * 100),
              targetDate: g.targetDate,
              monthsRemaining: math.monthsRemaining,
              requiredMonthly: math.requiredMonthlyMinor !== null ? formatMoney(math.requiredMonthlyMinor, currency) : null,
              requiredBiweekly: math.requiredBiweeklyMinor !== null ? formatMoney(math.requiredBiweeklyMinor, currency) : null,
            };
          }),
          drilldown: '/goals',
        };
      },
    },

    {
      name: 'compare_periods',
      description:
        'Compare two periods month by month — income, expenses and savings rate. Use for "compare this month to last month" or "how has my spending changed".',
      inputSchema: {
        type: 'object',
        properties: { months: { type: 'number', description: 'How many recent months to return. Default 6.' } },
        required: [],
      },
      async run(input) {
        const months = Math.min(24, Math.max(2, (input.months as number) ?? 6));
        const txns = await load();
        const range: DateRange = { start: startOfMonth(addMonths(today, -(months - 1))), end: today };
        return {
          months: monthlySeries(txns, range).map((m) => ({
            month: m.month,
            income: formatMoney(m.income, currency),
            expenses: formatMoney(m.expenses, currency),
            net: formatMoney(m.net, currency),
            savingsRatePercent: Math.round(m.savingsRateBps / 100),
          })),
          drilldown: '/analytics',
        };
      },
    },

    {
      name: 'get_top_merchants',
      description: 'Largest and most frequent merchants for a period.',
      inputSchema: {
        type: 'object',
        properties: { ...periodProperty, limit: { type: 'number' } },
        required: [],
      },
      async run(input) {
        const range = resolveRange(input);
        const txns = await load();
        const inRange = txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);
        return {
          range,
          merchants: spendingByMerchant(inRange).slice(0, (input.limit as number) ?? 10).map((m) => ({
            merchant: m.merchantName,
            total: formatMoney(m.amountMinor, currency),
            visits: m.transactionCount,
            average: formatMoney(m.averageMinor, currency),
          })),
          drilldown: '/analytics',
        };
      },
    },
  ];
}

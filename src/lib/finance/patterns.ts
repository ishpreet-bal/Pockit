/**
 * Spending patterns (spec §48) and the insights engine (spec §36).
 *
 * Insights are DETERMINISTIC. The AI's only role is to phrase a figure this module
 * has already computed — it never produces the figure. Every insight carries the
 * transaction ids it came from, so any claim can be checked against the ledger.
 */
import { sumMinor, absMinor, mulRatio, formatMoney } from '@/lib/money';
import type { DateRange, IsoDate, LedgerTxn, LedgerCategory } from './types';
import { isWeekend, previousPeriod, monthsInRange } from './period';
import { periodTotals, spendingByCategory, spendingByMerchant, spendingAmount, countsAsSpending } from './ledger';

/* ------------------------------------------------------------------ */
/* Patterns                                                            */
/* ------------------------------------------------------------------ */

export interface SpendingPatterns {
  weekdayMinor: bigint;
  weekendMinor: bigint;
  weekdayDailyAverageMinor: bigint;
  weekendDailyAverageMinor: bigint;
  fixedMinor: bigint;
  variableMinor: bigint;
  essentialMinor: bigint;
  discretionaryMinor: bigint;
  topMerchants: { merchantName: string; amountMinor: bigint; transactionCount: number }[];
  mostFrequentMerchants: { merchantName: string; transactionCount: number; amountMinor: bigint }[];
  averageTransactionMinor: bigint;
  largestTransaction: { id: string; description: string; amountMinor: bigint; date: IsoDate } | null;
}

export function analyzePatterns(
  txns: readonly LedgerTxn[],
  categories: readonly LedgerCategory[],
): SpendingPatterns {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const spending = txns.filter(countsAsSpending);

  let weekday = 0n;
  let weekend = 0n;
  const weekdayDays = new Set<IsoDate>();
  const weekendDays = new Set<IsoDate>();
  let fixed = 0n;
  let variable = 0n;
  let essential = 0n;
  let discretionary = 0n;
  let largest: SpendingPatterns['largestTransaction'] = null;

  for (const t of spending) {
    const amount = spendingAmount(t);
    if (amount <= 0n) continue;

    if (isWeekend(t.postedDate)) { weekend += amount; weekendDays.add(t.postedDate); }
    else { weekday += amount; weekdayDays.add(t.postedDate); }

    const cat = t.categoryId ? categoryById.get(t.categoryId) : undefined;
    if (cat?.classification === 'fixed' || t.isRecurring) fixed += amount; else variable += amount;
    if (cat?.necessity === 'essential') essential += amount; else discretionary += amount;

    if (!largest || amount > largest.amountMinor) {
      largest = { id: t.id, description: t.merchantName ?? t.description, amountMinor: amount, date: t.postedDate };
    }
  }

  const merchants = spendingByMerchant(spending);
  const total = sumMinor(spending.map(spendingAmount));

  return {
    weekdayMinor: weekday,
    weekendMinor: weekend,
    weekdayDailyAverageMinor: weekdayDays.size > 0 ? weekday / BigInt(weekdayDays.size) : 0n,
    weekendDailyAverageMinor: weekendDays.size > 0 ? weekend / BigInt(weekendDays.size) : 0n,
    fixedMinor: fixed,
    variableMinor: variable,
    essentialMinor: essential,
    discretionaryMinor: discretionary,
    topMerchants: merchants.slice(0, 10).map((m) => ({ merchantName: m.merchantName, amountMinor: m.amountMinor, transactionCount: m.transactionCount })),
    mostFrequentMerchants: [...merchants].sort((a, b) => b.transactionCount - a.transactionCount).slice(0, 10)
      .map((m) => ({ merchantName: m.merchantName, transactionCount: m.transactionCount, amountMinor: m.amountMinor })),
    averageTransactionMinor: spending.length > 0 ? total / BigInt(spending.length) : 0n,
    largestTransaction: largest,
  };
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

export interface ComputedInsight {
  kind: string;
  dedupeKey: string;
  headline: string;
  detail: string | null;
  severity: 'info' | 'notice' | 'attention';
  /** The raw figures. AI narration may only rephrase these, never recompute them. */
  metrics: Record<string, string | number>;
  transactionIds: string[];
}

export interface InsightContext {
  currency: string;
  current: DateRange;
  txns: readonly LedgerTxn[];
  /** Trailing history used for averages, excluding the current period. */
  historyTxns: readonly LedgerTxn[];
  historyRange: DateRange;
  categories: readonly LedgerCategory[];
}

/**
 * Compute every insight the ledger supports. Each one is a fact plus its provenance.
 */
export function computeInsights(ctx: InsightContext): ComputedInsight[] {
  const out: ComputedInsight[] = [];
  const fmt = (v: bigint) => formatMoney(v, ctx.currency);
  const periodKey = `${ctx.current.start}:${ctx.current.end}`;

  const currentTxns = ctx.txns.filter((t) => t.postedDate >= ctx.current.start && t.postedDate <= ctx.current.end);
  const current = periodTotals(currentTxns);

  const prevRange = previousPeriod(ctx.current);
  const prevTxns = ctx.txns.filter((t) => t.postedDate >= prevRange.start && t.postedDate <= prevRange.end);
  const previous = periodTotals(prevTxns);

  /* Savings rate. */
  if (current.income > 0n) {
    const pct = Math.round(current.savingsRateBps / 100);
    out.push({
      kind: 'savings_rate',
      dedupeKey: `savings_rate:${periodKey}`,
      headline: `You saved ${pct}% of your income this period.`,
      detail: `${fmt(current.income)} in, ${fmt(current.expenses)} out, leaving ${fmt(current.netCashFlow)}.`,
      severity: pct < 0 ? 'attention' : 'info',
      metrics: { savingsRateBps: current.savingsRateBps, income: current.income.toString(), expenses: current.expenses.toString() },
      transactionIds: currentTxns.map((t) => t.id),
    });
  }

  /* Total spending vs the previous period, with the categories that drove it. */
  if (previous.expenses > 0n && current.expenses !== previous.expenses) {
    const diff = current.expenses - previous.expenses;
    const pct = Number(mulRatio(absMinor(diff), 100n, previous.expenses));
    if (pct >= 10) {
      const drivers = topMovers(currentTxns, prevTxns, ctx.categories, diff > 0n ? 'increase' : 'decrease');
      out.push({
        kind: 'spending_change',
        dedupeKey: `spending_change:${periodKey}`,
        headline: `You spent ${fmt(absMinor(diff))} ${diff > 0n ? 'more' : 'less'} than the previous period.`,
        detail: drivers.length > 0
          ? `Mostly ${drivers.map((d) => `${d.name} (${diff > 0n ? '+' : '−'}${fmt(absMinor(d.diff))})`).join(' and ')}.`
          : null,
        severity: diff > 0n && pct >= 30 ? 'notice' : 'info',
        metrics: { differenceMinor: diff.toString(), percentChange: pct },
        transactionIds: drivers.flatMap((d) => d.transactionIds),
      });
    }
  }

  /* Per-category deviation from the trailing average. */
  const months = Math.max(1, monthsInRange(ctx.historyRange).length);
  const historyByCategory = new Map(
    spendingByCategory(ctx.historyTxns).map((c) => [c.categoryId ?? '', c.amountMinor / BigInt(months)]),
  );
  const categoryById = new Map(ctx.categories.map((c) => [c.id, c]));

  for (const entry of spendingByCategory(currentTxns)) {
    if (!entry.categoryId || entry.amountMinor <= 0n) continue;
    const avg = historyByCategory.get(entry.categoryId);
    if (!avg || avg < 2_000n) continue; // ignore categories under $20/month average
    const diff = entry.amountMinor - avg;
    const pct = Number(mulRatio(absMinor(diff), 100n, avg));
    if (pct < 25) continue;
    const name = categoryById.get(entry.categoryId)?.name ?? 'Uncategorised';
    out.push({
      kind: 'category_deviation',
      dedupeKey: `category_deviation:${entry.categoryId}:${periodKey}`,
      headline: `${name} spending is ${pct}% ${diff > 0n ? 'above' : 'below'} your ${months}-month average.`,
      detail: `${fmt(entry.amountMinor)} this period versus an average of ${fmt(avg)}.`,
      severity: diff > 0n && pct >= 50 ? 'notice' : 'info',
      metrics: { categoryId: entry.categoryId, currentMinor: entry.amountMinor.toString(), averageMinor: avg.toString(), percentChange: pct },
      transactionIds: entry.transactionIds,
    });
  }

  /* Recurring cost as a share of income. */
  const recurringTotal = sumMinor(currentTxns.filter((t) => t.isRecurring).map(spendingAmount));
  if (recurringTotal > 0n && current.income > 0n) {
    const pct = Number(mulRatio(recurringTotal, 100n, current.income));
    out.push({
      kind: 'recurring_share',
      dedupeKey: `recurring_share:${periodKey}`,
      headline: `Your recurring expenses represent ${pct}% of your income this period.`,
      detail: `${fmt(recurringTotal)} of ${fmt(current.income)}.`,
      severity: pct >= 50 ? 'notice' : 'info',
      metrics: { recurringMinor: recurringTotal.toString(), sharePercent: pct },
      transactionIds: currentTxns.filter((t) => t.isRecurring).map((t) => t.id),
    });
  }

  /* Unusually large single transactions. */
  const spending = currentTxns.filter(countsAsSpending);
  if (spending.length >= 8) {
    const amounts = spending.map(spendingAmount).filter((a) => a > 0n);
    const avg = amounts.length > 0 ? sumMinor(amounts) / BigInt(amounts.length) : 0n;
    for (const t of spending) {
      const amount = spendingAmount(t);
      if (avg > 0n && amount > avg * 5n && amount > 20_000n) {
        out.push({
          kind: 'large_transaction',
          dedupeKey: `large_transaction:${t.id}`,
          headline: `${fmt(amount)} at ${t.merchantName ?? t.description} is well above your usual transaction size.`,
          detail: `Your average transaction this period is ${fmt(avg)}.`,
          severity: 'info',
          metrics: { amountMinor: amount.toString(), averageMinor: avg.toString() },
          transactionIds: [t.id],
        });
      }
    }
  }

  return out;
}

function topMovers(
  current: readonly LedgerTxn[],
  previous: readonly LedgerTxn[],
  categories: readonly LedgerCategory[],
  direction: 'increase' | 'decrease',
): { name: string; diff: bigint; transactionIds: string[] }[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const prevByCat = new Map(spendingByCategory(previous).map((c) => [c.categoryId ?? '', c.amountMinor]));
  const movers: { name: string; diff: bigint; transactionIds: string[] }[] = [];

  for (const entry of spendingByCategory(current)) {
    const key = entry.categoryId ?? '';
    const diff = entry.amountMinor - (prevByCat.get(key) ?? 0n);
    if (direction === 'increase' ? diff <= 0n : diff >= 0n) continue;
    movers.push({
      name: entry.categoryId ? categoryById.get(entry.categoryId)?.name ?? 'Uncategorised' : 'Uncategorised',
      diff,
      transactionIds: entry.transactionIds,
    });
  }

  return movers
    .sort((a, b) => Number(absMinor(b.diff) - absMinor(a.diff)))
    .slice(0, 2);
}

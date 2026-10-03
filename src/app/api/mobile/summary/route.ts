import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { holdings, watchlistItems } from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { buildOverview } from '@/lib/finance/view/overview';
import { marketData, catalogEntry } from '@/lib/market';

export const dynamic = 'force-dynamic';

const n = (v: bigint | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

/**
 * Everything the iPhone app's four tabs show, in one request.
 *
 * Built on the same `buildOverview` the website uses, so a number on the phone and
 * the same number on the web can never disagree. Money is returned in minor units as
 * plain numbers (JSON has no bigint); every amount a person holds fits comfortably.
 *
 * Investments are priced from live quotes when the market-data quota allows and
 * fall back to the stored value otherwise — a slow or exhausted provider must not
 * blank the whole app.
 */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { user, workspace } = ctx;

  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const d = await buildOverview(repo, user.timezone, user.locale);

  const [held, watched] = await Promise.all([
    withUser(user.id, (tx) => tx.select().from(holdings).where(eq(holdings.workspaceId, workspace.id))),
    withUser(user.id, (tx) => tx.select({ symbol: watchlistItems.symbol }).from(watchlistItems).where(eq(watchlistItems.workspaceId, workspace.id)).limit(5)),
  ]);

  const symbols = [...new Set([...held.map((h) => h.symbol), ...watched.map((w) => w.symbol)].filter((s): s is string => Boolean(s)).map((s) => s.toUpperCase()))];
  let quotes = new Map<string, { priceMinor: bigint | number; changeBps: number | null }>();
  if (symbols.length > 0) {
    try {
      quotes = (await marketData().quotes(symbols)) as unknown as typeof quotes;
    } catch { /* stored values below */ }
  }

  const positions = held.map((row) => {
    const quote = row.symbol ? quotes.get(row.symbol.toUpperCase()) : undefined;
    const units = Number(row.quantity);
    const valueMinor = quote && units > 0 ? Math.round(Number(quote.priceMinor) * units) : Number(row.currentValueMinor);
    const costMinor = Number(row.costBasisMinor);
    return {
      symbol: row.symbol ?? row.name.slice(0, 4).toUpperCase(),
      name: row.name,
      valueMinor,
      gainMinor: valueMinor - costMinor,
      changePct: quote?.changeBps == null ? null : quote.changeBps / 100,
    };
  });
  const totalValueMinor = positions.reduce((s, p) => s + p.valueMinor, 0);
  const totalCostMinor = held.reduce((s, r) => s + Number(r.costBasisMinor), 0);

  const budget = d.budgetStatus;
  const byCategory = new Map(budget?.lines.filter((l) => l.categoryId).map((l) => [l.categoryId!, n(l.targetMinor)]) ?? []);

  return NextResponse.json({
    currency: d.currency,
    today: d.today,
    hasData: d.hasTransactions || d.hasRecurring,
    /** With no money recorded in any account, "safe to spend" has nothing to start from. */
    hasBalance: d.position.cashNowMinor !== 0n,

    home: {
      safeToSpendMinor: n(d.available.amountMinor),
      explanation: d.available.explanation,
      short: d.available.tone === 'attention',
      daysLeft: d.position.daysLeftInPeriod,
      nextIncome: d.nextIncome ? { name: d.nextIncome.name, date: d.nextIncome.date, amountMinor: n(d.nextIncome.amountMinor) } : null,
      upcoming: d.position.soonCommitments.filter((u) => u.kind !== 'income').slice(0, 8).map((u) => ({ name: u.name, date: u.date, amountMinor: n(u.amountMinor) })),
      /** Monthly net cash flow for the small chart: positive months saved, negative spent more than came in. */
      trend: d.series6.map((m) => ({ month: m.month, netMinor: n(m.net) })),
    },

    spending: {
      spentMinor: n(d.spent),
      spentDeltaMinor: n(d.spentDeltaMinor),
      periodStart: d.period.start,
      periodEnd: d.period.end,
      daily: d.dailySpend.map((x) => ({ date: x.date, amountMinor: n(x.amountMinor) })),
      budgetMinor: budget ? n(budget.totalTargetMinor) : null,
      categories: d.topCategories.slice(0, 4).map((c) => ({
        id: c.id, name: c.name, icon: c.icon, amountMinor: n(c.amountMinor), budgetMinor: byCategory.get(c.id) ?? null,
      })),
      recent: d.recent.slice(0, 3).map((t) => ({
        // Signed for display: money in is positive, money out negative.
        id: t.id, name: t.description, date: t.date, amountMinor: t.type === 'income' ? Math.abs(n(t.amountMinor)!) : -Math.abs(n(t.amountMinor)!), icon: t.categoryIcon, category: t.categoryName,
      })),
    },

    goals: d.allGoals.map(({ goal, math }) => ({
      id: goal.id,
      name: goal.name,
      currentMinor: n(goal.currentMinor),
      targetMinor: n(goal.targetMinor),
      targetDate: goal.targetDate,
      monthlyMinor: n(goal.monthlyContributionMinor ?? math.requiredMonthlyMinor),
      // A goal picked in setup has no amount yet; that is "not started", not "done".
      achieved: goal.targetMinor > 0n && math.isAchieved,
      // Plain status: ahead/on pace, behind by more than a month, or no date to judge by.
      status: goal.targetMinor === 0n ? 'open' : math.isAchieved ? 'done' : math.scheduleVarianceMonths === null ? 'open' : math.scheduleVarianceMonths < -1 ? 'behind' : 'on_track',
    })),

    invest: {
      totalValueMinor,
      gainMinor: totalValueMinor - totalCostMinor,
      gainPct: totalCostMinor > 0 ? Math.round(((totalValueMinor - totalCostMinor) / totalCostMinor) * 10000) / 100 : null,
      holdings: positions.sort((a, b) => b.valueMinor - a.valueMinor),
      watchlist: watched.map((w) => {
        const q = quotes.get(w.symbol.toUpperCase());
        return { symbol: w.symbol, name: catalogEntry(w.symbol)?.name ?? w.symbol, priceMinor: n(q?.priceMinor as bigint | undefined), changePct: q?.changeBps == null ? null : q.changeBps / 100 };
      }),
    },
  });
}

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { accounts, bankConnections, holdings, watchlistItems } from '@/lib/db/schema';
import { cardsDue } from '@/lib/finance/cards';
import { plaidConfigured } from '@/lib/bank/plaid';
import { WorkspaceRepo } from '@/lib/data/repository';
import { buildOverview } from '@/lib/finance/view/overview';
import { marketData, catalogEntry, type Quote } from '@/lib/market';
import { totalHoldings, valueHolding } from '@/lib/investing/valuation';
import { listShares } from '@/lib/data/cost-shares';

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

  const [held, watched, banks, shares, cardRows] = await Promise.all([
    withUser(user.id, (tx) => tx.select().from(holdings).where(eq(holdings.workspaceId, workspace.id))),
    withUser(user.id, (tx) => tx.select({ symbol: watchlistItems.symbol, name: watchlistItems.name }).from(watchlistItems).where(eq(watchlistItems.workspaceId, workspace.id))),
    withUser(user.id, (tx) => tx.select({ id: bankConnections.id }).from(bankConnections).where(eq(bankConnections.workspaceId, workspace.id)).limit(1)),
    listShares({ userId: user.id, workspaceId: workspace.id }),
    withUser(user.id, (tx) => tx.select({
      id: accounts.id, name: accounts.name, mask: accounts.mask, institution: accounts.institution,
      paymentDueDate: accounts.paymentDueDate, paymentDueDay: accounts.paymentDueDay,
      statementBalanceMinor: accounts.statementBalanceMinor, minimumPaymentMinor: accounts.minimumPaymentMinor,
      lastPaymentDate: accounts.lastPaymentDate, lastStatementDate: accounts.lastStatementDate,
    }).from(accounts).where(and(eq(accounts.workspaceId, workspace.id), eq(accounts.type, 'credit_card'), eq(accounts.isActive, true), isNull(accounts.deletedAt)))),
  ]);
  // The amount comes from the bank's statement; a due day typed in by hand has a date but no amount.
  const cards = cardsDue(cardRows.map((r) => ({
    ...r, balanceMinor: null,
    statementBalanceMinor: n(r.statementBalanceMinor), minimumPaymentMinor: n(r.minimumPaymentMinor),
  })), d.today);
  const owing = shares.filter((s) => s.owedMinor > 0);

  const following = [...new Map(watched.map((w) => [w.symbol.toUpperCase(), w])).values()];
  const symbols = [...new Set([...held.map((h) => h.symbol), ...following.map((w) => w.symbol)].filter((s): s is string => Boolean(s)).map((s) => s.toUpperCase()))];
  let quotes = new Map<string, Quote>();
  if (symbols.length > 0) {
    try {
      quotes = await marketData().quotes(symbols);
    } catch { /* stored values below */ }
  }

  const positions = held.map((row) => {
    const valued = valueHolding(row, row.symbol ? quotes.get(row.symbol.toUpperCase()) : undefined);
    return {
      ...valued, valueMinor: Number(valued.valueMinor), costMinor: Number(valued.costMinor), gainMinor: Number(valued.gainMinor),
    };
  });
  const totals = totalHoldings(held.map((row) => valueHolding(row, row.symbol ? quotes.get(row.symbol.toUpperCase()) : undefined)));
  const baseTotal = totals.find((t) => t.currency === workspace.baseCurrency);

  const budget = d.budgetStatus;
  const byCategory = new Map(budget?.lines.filter((l) => l.categoryId).map((l) => [l.categoryId!, n(l.targetMinor)]) ?? []);

  return NextResponse.json({
    currency: d.currency,
    today: d.today,
    hasData: d.hasTransactions || d.hasRecurring,
    /** With no money recorded in any account, "safe to spend" has nothing to start from. */
    hasBalance: d.position.cashNowMinor !== 0n,
    bank: { available: plaidConfigured(), connected: banks.length > 0 },
    space: { name: workspace.name, shared: workspace.kind === 'household' },
    /** Split expenses still waiting on money. Not counted as cash until it arrives. */
    owed: { minor: owing.reduce((s, x) => s + x.owedMinor, 0), count: owing.length },

    home: {
      safeToSpendMinor: n(d.available.amountMinor),
      explanation: d.available.explanation,
      short: d.available.tone === 'attention',
      daysLeft: d.position.daysLeftInPeriod,
      nextIncome: d.nextIncome ? { name: d.nextIncome.name, date: d.nextIncome.date, amountMinor: n(d.nextIncome.amountMinor) } : null,
      upcoming: d.position.soonCommitments.filter((u) => u.kind !== 'income').slice(0, 8).map((u) => ({ name: u.name, date: u.date, amountMinor: n(u.amountMinor) })),
      /** Credit card payments coming up. Reminders only: card balances already count against safe to spend. */
      cards,
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
      totalValueMinor: Number(baseTotal?.valueMinor ?? 0n),
      gainMinor: Number(baseTotal?.gainMinor ?? 0n),
      gainPct: baseTotal?.gainPct ?? null,
      totals: totals.map((t) => ({ ...t, valueMinor: Number(t.valueMinor), costMinor: Number(t.costMinor), gainMinor: Number(t.gainMinor) })),
      holdings: positions.sort((a, b) => b.valueMinor - a.valueMinor),
      watchlist: following.map((w) => {
        const q = quotes.get(w.symbol.toUpperCase());
        return { symbol: w.symbol, name: catalogEntry(w.symbol)?.name ?? w.name ?? w.symbol, currency: q?.currency ?? catalogEntry(w.symbol)?.currency ?? null, priceMinor: n(q?.priceMinor), changePct: q?.changeBps == null ? null : q.changeBps / 100, simulated: q?.simulated ?? false, source: q?.source ?? null, asOf: q?.asOf ?? null };
      }),
    },
  });
}

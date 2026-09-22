import 'server-only';
import { eq, and } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import {
  goals, recurringSeries, budgets, budgetAllocations,
  holdings, watchlistItems, investorProfiles, accounts,
} from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { formatMoney } from '@/lib/money';
import { spendingByCategory } from '@/lib/finance/ledger';
import { computeCashFlowBasis } from '@/lib/finance/goals';
import { startOfMonth, addMonths } from '@/lib/finance/period';
import type { LedgerCategory, LedgerTxn } from '@/lib/finance/types';
import { inferKind, profileFor } from '@/lib/finance/goal-kinds';

/** The same three-month window every other feasibility statement in the app uses. */
function threeMonths(today: string) {
  return { start: startOfMonth(addMonths(today, -2)), end: today };
}

/**
 * What Pock is told about THIS person, for THIS question.
 *
 * The rule from the brief, and the right one: do not send the database. Each slice
 * below is fetched only when the question is about it. A question about a goal does
 * not need a watchlist, and shipping one costs tokens, latency and privacy for
 * nothing.
 *
 * Every slice states what it does NOT know, because a silent gap is what a model
 * fills in from imagination.
 */

export type ContextSlice =
  | 'cashflow' | 'goals' | 'spending' | 'recurring' | 'budget' | 'investments' | 'accounts';

/** Which slices does this question need? Cheap keyword routing, not a model call. */
export function slicesFor(question: string, anchor?: PockAnchor | null): ContextSlice[] {
  const text = question.toLowerCase();
  const slices = new Set<ContextSlice>();

  // An anchor is an explicit "ask about THIS" from a page, so it always counts.
  if (anchor?.kind === 'goal') slices.add('goals');
  if (anchor?.kind === 'symbol') slices.add('investments');
  if (anchor?.kind === 'budget') slices.add('budget');
  if (anchor?.kind === 'spending') slices.add('spending');

  const rules: [RegExp, ContextSlice][] = [
    [/goal|saving|emergency fund|target|vacation|house|car fund|tuition/, 'goals'],
    [/spend|spent|spending|where.*money|category|most|expensive/, 'spending'],
    [/afford|available|spare|left over|cash ?flow|income|earn|salary|negative/, 'cashflow'],
    [/recurring|bill|subscription|rent|repeat|monthly payment/, 'recurring'],
    [/budget|limit|over ?budget|allocat/, 'budget'],
    [/invest|stock|etf|crypto|portfolio|watchlist|holding|share/, 'investments'],
    [/account|balance|debt|credit card|loan|net worth|owe/, 'accounts'],
  ];
  for (const [pattern, slice] of rules) if (pattern.test(text)) slices.add(slice);

  // Cash flow is the substrate for almost every money question, so an otherwise
  // unrouted question gets it rather than getting nothing.
  if (slices.size === 0) slices.add('cashflow');
  return [...slices];
}

/** An explicit subject carried from the page the question was asked on. */
export interface PockAnchor {
  kind: 'goal' | 'symbol' | 'budget' | 'spending';
  id?: string;
  label?: string;
}

export interface BuiltContext {
  text: string;
  slices: ContextSlice[];
  /** Kept with the answer so a claim can be audited against what was known. */
  facts: Record<string, unknown>;
}

export async function buildUserContext(
  tx: Db,
  opts: {
    userId: string;
    workspaceId: string;
    currency: string;
    timezone: string;
    today: string;
    question: string;
    anchor?: PockAnchor | null;
  },
): Promise<BuiltContext> {
  const slices = slicesFor(opts.question, opts.anchor);
  const lines: string[] = [];
  const facts: Record<string, unknown> = {};
  const money = (v: bigint) => formatMoney(v, opts.currency);

  const repo = new WorkspaceRepo(opts.userId, opts.workspaceId, opts.currency);

  // Transactions are needed by three slices, so they are fetched once.
  const needsTxns = slices.some((s) => s === 'cashflow' || s === 'spending' || s === 'budget');
  const txns: LedgerTxn[] = needsTxns ? await repo.listTransactions() : [];
  const cats: LedgerCategory[] = needsTxns || slices.includes('goals') ? await repo.listCategories() : [];
  const catById = new Map(cats.map((c) => [c.id, c]));
  const window = threeMonths(opts.today);

  if (slices.includes('cashflow')) {
    const basis = computeCashFlowBasis(txns, window, 3);
    lines.push(
      `CASH FLOW (from the last ${basis.months} months of recorded activity, not a forecast):`,
      `- Money in, monthly average: ${money(basis.averageIncomeMinor)}`,
      `- Money out, monthly average: ${money(basis.averageExpensesMinor)}`,
      `- Spare each month: ${money(basis.availableMinor)}${basis.availableMinor < 0n ? ' — NEGATIVE, meaning recorded spending exceeds recorded income over this window' : ''}`,
    );
    facts.cashflow = {
      months: basis.months,
      incomeMinor: Number(basis.averageIncomeMinor),
      outgoingsMinor: Number(basis.averageExpensesMinor),
      availableMinor: Number(basis.availableMinor),
    };
    if (txns.length === 0) {
      lines.push('- There are NO transactions recorded, so these figures are all zero rather than small. Say that plainly rather than treating zero as a finding.');
    }
  }

  if (slices.includes('goals')) {
    const rows = await tx.select().from(goals)
      .where(and(eq(goals.workspaceId, opts.workspaceId), eq(goals.status, 'active')));

    if (rows.length === 0) {
      lines.push('GOALS: none set up yet.');
    } else {
      const basis = txns.length > 0 ? computeCashFlowBasis(txns, window, 3) : null;
      lines.push(`GOALS (${rows.length} active):`);
      for (const g of rows) {
        // The anchor's goal gets full detail; the others are summarised, so asking
        // about one goal does not ship every goal's arithmetic.
        const isAnchor = opts.anchor?.kind === 'goal' && opts.anchor.id === g.id;
        const kind = inferKind(g.name, g.kind);
        const profile = profileFor(kind);
        const target = BigInt(g.targetMinor as unknown as string);
        const current = BigInt(g.currentMinor as unknown as string);
        const pct = target > 0n ? Number((current * 100n) / target) : 0;

        lines.push(
          `- "${g.name}" (type: ${profile.label}): ${money(current)} of ${money(target)} (${pct}%)` +
          `${g.targetDate ? `, target date ${g.targetDate}` : ', no target date'}` +
          `${g.monthlyContributionMinor ? `, contributing ${money(BigInt(g.monthlyContributionMinor as unknown as string))}/month` : ''}`,
        );
        if (isAnchor) {
          lines.push(`  This is the goal being asked about. What matters for this type: ${profile.centralQuestion}`);
          if (profile.delayHasFinancialCost) {
            lines.push('  Delaying this one costs interest, unlike the others here.');
          }
          if (basis) {
            lines.push(`  Their spare cash across ALL goals is ${money(basis.availableMinor)} a month; this goal competes with the others listed.`);
          }
        }
      }
      facts.goals = rows.map((g) => ({ id: g.id, name: g.name, kind: inferKind(g.name, g.kind) }));
    }
  }

  if (slices.includes('spending')) {
    const basis = computeCashFlowBasis(txns, window, 3);
    const spend = spendingByCategory(
      txns.filter((t: LedgerTxn) => t.postedDate >= basis.range.start && t.postedDate <= basis.range.end),
    ).filter((s) => s.amountMinor > 0n).slice(0, 8);

    if (spend.length === 0) {
      lines.push('SPENDING: nothing recorded in the last three months.');
    } else {
      lines.push(`SPENDING, biggest categories over ${basis.range.start} to ${basis.range.end}:`);
      for (const s of spend) {
        const cat = s.categoryId ? catById.get(s.categoryId) : null;
        lines.push(`- ${cat?.name ?? 'Uncategorised'}: ${money(s.amountMinor)} total, ${money(s.amountMinor / BigInt(Math.max(1, basis.months)))}/month${cat?.necessity ? ` (${cat.necessity})` : ''}`);
      }
      facts.topSpending = spend.slice(0, 5).map((s) => ({
        category: s.categoryId ? catById.get(s.categoryId)?.name ?? null : null,
        amountMinor: Number(s.amountMinor),
      }));
    }
  }

  if (slices.includes('recurring')) {
    const rows = await tx.select().from(recurringSeries)
      .where(eq(recurringSeries.workspaceId, opts.workspaceId)).limit(40);
    if (rows.length === 0) {
      lines.push('RECURRING: nothing set up. Bills and income that repeat are added under /recurring.');
    } else {
      lines.push(`RECURRING (${rows.length}):`);
      for (const r of rows.slice(0, 20)) {
        lines.push(`- ${r.name}: ${money(BigInt(r.amountMinor as unknown as string))} ${r.cadence}${r.nextExpectedDate ? `, next ${r.nextExpectedDate}` : ''}`);
      }
    }
  }

  if (slices.includes('budget')) {
    // A budget's per-category limits live in budget_allocations, not on the budget
    // row itself, so the allocations are what answer "what is my limit for food".
    const rows = await tx.select({
      budgetName: budgets.name,
      categoryId: budgetAllocations.categoryId,
      label: budgetAllocations.label,
      amountMinor: budgetAllocations.amountMinor,
    })
      .from(budgets)
      .leftJoin(budgetAllocations, eq(budgetAllocations.budgetId, budgets.id))
      .where(and(eq(budgets.workspaceId, opts.workspaceId), eq(budgets.isActive, true)))
      .limit(40);

    if (rows.length === 0) {
      lines.push('BUDGET: no budget set up. Budgets are created under /budget.');
    } else {
      lines.push(`BUDGET "${rows[0]!.budgetName}" limits:`);
      for (const b of rows.slice(0, 20)) {
        if (b.amountMinor === null) continue;
        const cat = b.categoryId ? catById.get(b.categoryId) : null;
        lines.push(`- ${cat?.name ?? b.label ?? 'Category'}: ${money(BigInt(b.amountMinor as unknown as string))}/month`);
      }
    }
  }

  if (slices.includes('investments')) {
    const [held, watched, profile] = await Promise.all([
      tx.select().from(holdings).where(eq(holdings.workspaceId, opts.workspaceId)),
      tx.select().from(watchlistItems).where(eq(watchlistItems.workspaceId, opts.workspaceId)).limit(30),
      tx.select().from(investorProfiles).where(eq(investorProfiles.workspaceId, opts.workspaceId)).limit(1),
    ]);

    lines.push('INVESTMENTS:');
    lines.push(held.length === 0
      ? '- Nothing owned that is recorded here.'
      : `- Holdings: ${held.map((h) => `${h.symbol ?? '?'} × ${h.quantity}`).join(', ')}`);
    lines.push(watched.length === 0
      ? '- Watchlist is empty.'
      : `- Following: ${watched.map((w) => w.symbol).join(', ')} (following is not owning)`);
    if (profile[0]) lines.push(`- Their risk questionnaire result: ${profile[0].level}.`);
    else lines.push('- They have not completed the risk questionnaire, so their risk tolerance is unknown. Do not assume one.');
  }

  if (slices.includes('accounts')) {
    const rows = await tx.select().from(accounts).where(eq(accounts.workspaceId, opts.workspaceId));
    const debts = rows.filter((a) => a.type === 'credit_card' || a.type === 'loan' || a.type === 'line_of_credit');
    lines.push(`ACCOUNTS: ${rows.length} recorded${rows.length ? ` (${rows.map((a) => `${a.name}, ${a.type.replace(/_/g, ' ')}`).join('; ')})` : ''}.`);
    if (debts.length > 0) {
      lines.push(`- ${debts.length} of them are debt. Balances are derived from the ledger and were not fetched for this question; do not state one.`);
    }
  }

  return {
    text: lines.length > 0 ? `THIS PERSON'S DATA\n${lines.join('\n')}` : '',
    slices,
    facts,
  };
}

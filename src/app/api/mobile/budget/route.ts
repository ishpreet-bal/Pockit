import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { budgets, budgetAllocations } from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { buildOverview } from '@/lib/finance/view/overview';
import { startOfMonth, todayIn } from '@/lib/finance/period';

export const dynamic = 'force-dynamic';

/**
 * The app's budget: a monthly amount per category, next to what has gone out so far.
 *
 * Read from the same overview the website uses, so "spent" here matches Spending.
 */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const d = await buildOverview(repo, ctx.user.timezone, ctx.user.locale);
  const planned = new Map((d.budgetStatus?.lines ?? []).filter((l) => l.categoryId).map((l) => [l.categoryId!, Number(l.targetMinor)]));
  return NextResponse.json({
    currency: d.currency,
    hasPlan: planned.size > 0,
    categories: d.expenseCategories
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon, spentMinor: Number(c.amountMinor), planMinor: planned.get(c.id) ?? null }))
      .sort((a, b) => Number(b.planMinor !== null) - Number(a.planMinor !== null) || b.spentMinor - a.spentMinor),
  });
}

const schema = z.object({
  lines: z.array(z.object({ categoryId: z.string().uuid(), amount: z.number().nonnegative().max(1_000_000) })).max(60),
});

/** Replace the plan. Categories left at $0 are simply not budgeted. */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the amounts and try again.' }, { status: 400 });
  const lines = parsed.data.lines.filter((l) => l.amount > 0);
  const today = todayIn(ctx.user.timezone);

  await withUser(ctx.user.id, async (tx) => {
    await tx.update(budgets).set({ isActive: false })
      .where(and(eq(budgets.workspaceId, ctx.workspace.id), eq(budgets.isActive, true)));
    if (lines.length === 0) return;
    const made = await tx.insert(budgets).values({
      workspaceId: ctx.workspace.id,
      name: 'Monthly budget',
      method: 'category',
      period: 'monthly',
      periodStart: startOfMonth(today),
      setupAnswers: { createdFrom: 'app' },
      isActive: true,
    }).returning({ id: budgets.id });
    await tx.insert(budgetAllocations).values(lines.map((l, i) => ({
      workspaceId: ctx.workspace.id,
      budgetId: made[0]!.id,
      categoryId: l.categoryId,
      amountMinor: BigInt(Math.round(l.amount * 100)),
      sortOrder: i,
    })));
  });
  return NextResponse.json({ ok: true });
}

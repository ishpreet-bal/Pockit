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
/** The pay schedule a "resets on payday" budget follows: the first active income. */
async function paySchedule(repo: WorkspaceRepo) {
  const pay = (await repo.listManualSchedules()).find((m) => m.direction === 'inflow' && m.isActive && m.cadence !== 'custom' && m.cadence !== 'quarterly' && m.cadence !== 'annual');
  if (!pay) return null;
  const period = pay.cadence === 'weekly' ? 'weekly' : pay.cadence === 'biweekly' ? 'biweekly' : pay.cadence === 'semimonthly' ? 'semimonthly' : 'monthly';
  // Anchor on the most recent payday, so the current period has already begun.
  const today = new Date().toISOString().slice(0, 10);
  let start = new Date(`${pay.startDate}T12:00:00Z`);
  const step = (d: Date, dir: 1 | -1) => period === 'monthly' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, d.getUTCDate(), 12))
    : new Date(d.getTime() + dir * (period === 'weekly' ? 7 : period === 'biweekly' ? 14 : 15) * 86_400_000);
  while (start.toISOString().slice(0, 10) > today) start = step(start, -1);
  return { period, periodStart: start.toISOString().slice(0, 10), name: pay.name } as const;
}

export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const [d, active, pay] = await Promise.all([buildOverview(repo, ctx.user.timezone, ctx.user.locale), repo.getActiveBudget(), paySchedule(repo)]);
  const status = d.budgetStatus;
  const lines = new Map((status?.lines ?? []).filter((l) => l.categoryId).map((l) => [l.categoryId!, l]));
  const calendar = !active || (active.budget.period === 'monthly' && active.budget.periodStart.slice(8, 10) === '01');
  return NextResponse.json({
    currency: d.currency,
    hasPlan: lines.size > 0,
    rollover: Boolean(active?.budget.rollover),
    resetsOn: calendar ? 'month' : 'payday',
    payday: pay ? { name: pay.name, period: pay.period } : null,
    period: status ? status.period : { start: d.period.start, end: d.period.end },
    categories: d.expenseCategories
      .map((c) => {
        const l = lines.get(c.id);
        return {
          id: c.id, name: c.name, icon: c.icon,
          // On a payday budget, spent is counted over the budget's own dates.
          spentMinor: l ? Number(l.spentMinor) : calendar ? Number(c.amountMinor) : 0,
          planMinor: l ? Number(l.targetMinor - l.carriedMinor) : null,
          carriedMinor: l ? Number(l.carriedMinor) : 0,
        };
      })
      .sort((a, b) => Number(b.planMinor !== null) - Number(a.planMinor !== null) || b.spentMinor - a.spentMinor),
  });
}

const schema = z.object({
  lines: z.array(z.object({ categoryId: z.string().uuid(), amount: z.number().nonnegative().max(1_000_000) })).max(60),
  rollover: z.boolean().optional(),
  resetsOn: z.enum(['month', 'payday']).optional(),
});

/** Replace the plan. Categories left at $0 are simply not budgeted. */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the amounts and try again.' }, { status: 400 });
  const lines = parsed.data.lines.filter((l) => l.amount > 0);
  const today = todayIn(ctx.user.timezone);
  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const pay = parsed.data.resetsOn === 'payday' ? await paySchedule(repo) : null;
  if (parsed.data.resetsOn === 'payday' && !pay) return NextResponse.json({ error: 'Add your pay under Bills first, so Pockit knows when payday is.' }, { status: 400 });

  await withUser(ctx.user.id, async (tx) => {
    await tx.update(budgets).set({ isActive: false })
      .where(and(eq(budgets.workspaceId, ctx.workspace.id), eq(budgets.isActive, true)));
    if (lines.length === 0) return;
    const made = await tx.insert(budgets).values({
      workspaceId: ctx.workspace.id,
      name: 'Monthly budget',
      method: 'category',
      period: pay?.period ?? 'monthly',
      periodStart: pay?.periodStart ?? startOfMonth(today),
      rollover: parsed.data.rollover ?? false,
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

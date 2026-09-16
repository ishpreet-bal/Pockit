import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { budgets, budgetAllocations } from '@/lib/db/schema';
import { startOfMonth, todayIn } from '@/lib/finance/period';
import { audit } from '@/lib/auth/session';

const schema = z.object({
  intent: z.string().max(40),
  expectedIncomeMinor: z.string().regex(/^\d+$/),
  lines: z.array(z.object({
    label: z.string().max(80),
    bucket: z.enum(['essentials', 'flexible', 'savings', 'investing', 'debt', 'goals']),
    amountMinor: z.string().regex(/^\d+$/),
  })).min(1).max(30),
});

const BUCKET_MAP: Record<string, 'needs' | 'wants' | 'savings' | 'debt'> = {
  essentials: 'needs', flexible: 'wants', savings: 'savings',
  investing: 'savings', goals: 'savings', debt: 'debt',
};

/** Save a guided plan as the active budget, replacing any previous one. */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const input = parsed.data;
  const today = todayIn(ctx.user.timezone);

  const budgetId = await withUser(ctx.user.id, async (tx) => {
    await tx.update(budgets).set({ isActive: false }).where(and(
      eq(budgets.workspaceId, ctx.workspace.id),
      eq(budgets.isActive, true),
    ));

    const rows = await tx.insert(budgets).values({
      workspaceId: ctx.workspace.id,
      name: 'Monthly plan',
      // A bucket plan is a percentage-style budget over income, not per-category caps.
      method: 'percentage',
      period: 'monthly',
      periodStart: startOfMonth(today),
      expectedIncomeMinor: BigInt(input.expectedIncomeMinor),
      intent: input.intent,
      setupAnswers: { intent: input.intent, createdFrom: 'guided' },
      isActive: true,
    }).returning({ id: budgets.id });

    const id = rows[0]!.id;
    await tx.insert(budgetAllocations).values(
      input.lines.map((line, i) => ({
        workspaceId: ctx.workspace.id,
        budgetId: id,
        categoryId: null,
        bucket: BUCKET_MAP[line.bucket] ?? 'wants',
        label: line.label,
        amountMinor: BigInt(line.amountMinor),
        sortOrder: i,
      })),
    );
    return id;
  });

  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'budget.create', entity: 'budget', entityId: budgetId,
    metadata: { intent: input.intent },
  });

  return NextResponse.json({ ok: true, id: budgetId });
}

export async function DELETE() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  await withUser(ctx.user.id, (tx) =>
    tx.update(budgets).set({ isActive: false }).where(and(
      eq(budgets.workspaceId, ctx.workspace.id),
      eq(budgets.isActive, true),
    )),
  );
  return NextResponse.json({ ok: true });
}

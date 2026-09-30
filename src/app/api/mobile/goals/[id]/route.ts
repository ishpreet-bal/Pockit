import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { goals, goalContributions } from '@/lib/db/schema';
import { audit } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  /** Money put toward the goal (negative takes some back out). Recorded as a contribution. */
  add: z.number().min(-100_000_000).max(100_000_000).refine((n) => n !== 0).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  target: z.number().positive().max(100_000_000).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const toMinor = (n: number) => BigInt(Math.round(n * 100));
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Change a goal: add money to it, or edit its name, amount or date.
 *
 * Adding money writes a contribution row as well as moving the total, so the
 * history of how a goal filled up is kept. The total never goes below zero, and a
 * goal that reaches its target is marked achieved (and un-marked if money comes out).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That could not be saved.' }, { status: 400 });
  const input = parsed.data;

  const updated = await withUser(ctx.user.id, async (tx) => {
    const where = and(eq(goals.id, id), eq(goals.workspaceId, ctx.workspace.id));
    const found = await tx.select({ id: goals.id }).from(goals).where(where).limit(1);
    if (found.length === 0) return null;

    if (input.add !== undefined) {
      const amount = toMinor(input.add);
      await tx.insert(goalContributions).values({ workspaceId: ctx.workspace.id, goalId: id, occurredOn: today(), amountMinor: amount, source: 'manual' });
      await tx.update(goals).set({ currentMinor: sql`greatest(0, ${goals.currentMinor} + ${amount})`, updatedAt: new Date() }).where(where);
    }
    if (input.name !== undefined || input.target !== undefined || input.targetDate !== undefined) {
      await tx.update(goals).set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.target !== undefined ? { targetMinor: toMinor(input.target) } : {}),
        ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
        updatedAt: new Date(),
      }).where(where);
    }
    // Keep status in step with the numbers.
    const [g] = await tx.select({ current: goals.currentMinor, target: goals.targetMinor, status: goals.status }).from(goals).where(where);
    const reached = g!.target > 0n && g!.current >= g!.target;
    if (reached && g!.status !== 'achieved') await tx.update(goals).set({ status: 'achieved', achievedAt: new Date() }).where(where);
    if (!reached && g!.status === 'achieved') await tx.update(goals).set({ status: 'active', achievedAt: null }).where(where);
    return { currentMinor: Number(g!.current), targetMinor: Number(g!.target), achieved: reached };
  });

  if (!updated) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: input.add !== undefined ? 'goal.contribute' : 'goal.update', entity: 'goal', entityId: id });
  return NextResponse.json({ ok: true, ...updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  const removed = await withUser(ctx.user.id, (tx) =>
    tx.delete(goals).where(and(eq(goals.id, id), eq(goals.workspaceId, ctx.workspace.id))).returning({ id: goals.id }),
  );
  if (removed.length === 0) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'goal.delete', entity: 'goal', entityId: id });
  return NextResponse.json({ ok: true });
}

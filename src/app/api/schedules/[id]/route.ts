import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { recurringSeries } from '@/lib/db/schema';
import { parseMoney, absMinor } from '@/lib/money';
import { audit } from '@/lib/auth/session';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  amount: z.string().optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
  isWanted: z.boolean().optional(),
  categoryId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const values: Record<string, unknown> = {};
  const input = parsed.data;
  if (input.name) { values.name = input.name; values.merchantName = input.name; }
  if (input.dayOfMonth !== undefined) values.dayOfMonth = input.dayOfMonth;
  if (input.endDate !== undefined) values.endDate = input.endDate;
  if (input.status) values.status = input.status;
  if (input.isWanted !== undefined) values.isWanted = input.isWanted;
  if (input.categoryId !== undefined) values.categoryId = input.categoryId;
  if (input.amount) {
    const value = parseMoney(input.amount, ctx.workspace.baseCurrency);
    if (value === null || absMinor(value) === 0n) {
      return NextResponse.json({ error: 'Enter an amount' }, { status: 400 });
    }
    values.amountMinor = absMinor(value);
  }
  if (Object.keys(values).length === 0) return NextResponse.json({ ok: true });

  await withUser(ctx.user.id, (tx) =>
    tx.update(recurringSeries).set(values).where(and(
      eq(recurringSeries.id, id),
      eq(recurringSeries.workspaceId, ctx.workspace.id),
    )),
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  // Only user-created schedules can be deleted. A detected pattern is an observation
  // about real transactions; removing it would not remove the transactions, so it is
  // dismissed instead.
  const removed = await withUser(ctx.user.id, (tx) =>
    tx.delete(recurringSeries).where(and(
      eq(recurringSeries.id, id),
      eq(recurringSeries.workspaceId, ctx.workspace.id),
      eq(recurringSeries.isManual, true),
    )).returning({ id: recurringSeries.id }),
  );

  if (removed.length === 0) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }
  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'schedule.delete', entity: 'recurring_series', entityId: id,
  });
  return NextResponse.json({ ok: true });
}

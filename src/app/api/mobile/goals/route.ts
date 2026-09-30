import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { goals } from '@/lib/db/schema';
import { audit } from '@/lib/auth/session';
import { inferKind } from '@/lib/finance/goal-kinds';

export const dynamic = 'force-dynamic';

const dollars = z.number().nonnegative().max(100_000_000);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give the goal a name').max(80),
  target: dollars.refine((n) => n > 0, 'Enter how much you want to save'),
  saved: dollars.optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const toMinor = (n: number) => BigInt(Math.round(n * 100));

/** Create a goal from the app. Amounts arrive in dollars, are stored in cents. */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const input = parsed.data;

  const rows = await withUser(ctx.user.id, (tx) =>
    tx.insert(goals).values({
      workspaceId: ctx.workspace.id,
      name: input.name,
      kind: inferKind(input.name, null) as typeof goals.$inferInsert.kind,
      targetMinor: toMinor(input.target),
      currentMinor: toMinor(input.saved ?? 0),
      currency: ctx.workspace.baseCurrency,
      targetDate: input.targetDate ?? null,
    }).returning({ id: goals.id }),
  );
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'goal.create', entity: 'goal', entityId: rows[0]!.id });
  return NextResponse.json({ ok: true, id: rows[0]!.id }, { status: 201 });
}

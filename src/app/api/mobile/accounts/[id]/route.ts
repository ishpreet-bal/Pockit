import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { accounts } from '@/lib/db/schema';
import { audit } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const body = z.object({
  /** The day of the month a card's payment is due, or null to forget it. */
  paymentDueDay: z.number().int().min(1).max(31).nullable(),
});

/**
 * Set when a card's payment is due, for banks that don't share statements (or a card
 * typed in by hand). A date from the bank's statement still wins when there is one.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pick a day from 1 to 31.' }, { status: 400 });
  const { id } = await params;
  const changed = await withUser(ctx.user.id, (tx) => tx.update(accounts)
    .set({ paymentDueDay: parsed.data.paymentDueDay, updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.workspaceId, ctx.workspace.id), eq(accounts.type, 'credit_card')))
    .returning({ id: accounts.id }));
  if (!changed.length) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'account.due_day', entity: 'account', entityId: id });
  return NextResponse.json({ ok: true });
}

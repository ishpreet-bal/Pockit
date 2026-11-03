import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { audit } from '@/lib/auth/session';
import { withUser } from '@/lib/db/client';
import { holdings } from '@/lib/db/schema';
import { todayIn } from '@/lib/finance/period';
import { holdingInput, holdingValues } from '@/lib/investing/holding-input';
import { toDecimalString } from '@/lib/money';
import { catalogEntry } from '@/lib/market/catalog';

export const dynamic = 'force-dynamic';

/** Manual tracking records only: these endpoints never post trades or change cash balances. */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const rows = await withUser(ctx.user.id, (tx) => tx.select().from(holdings).where(eq(holdings.workspaceId, ctx.workspace.id)));
  return NextResponse.json({ holdings: rows.map((h) => ({ id: h.id, name: h.name, symbol: h.symbol ?? '', currency: h.currency, quantity: h.quantity, currentValue: toDecimalString(h.currentValueMinor, h.currency), costBasis: toDecimalString(h.costBasisMinor, h.currency) })) });
}

async function save(request: Request, editing: boolean) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const schema = editing ? holdingInput.extend({ id: z.string().uuid() }) : holdingInput;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the holding details.' }, { status: 400 });
  const values = { ...holdingValues(parsed.data), valueAsOf: todayIn(ctx.user.timezone), updatedAt: new Date() };
  const id = 'id' in parsed.data ? String(parsed.data.id) : null;
  const rows = await withUser(ctx.user.id, (tx) => id
    ? tx.update(holdings).set(values).where(and(eq(holdings.id, id), eq(holdings.workspaceId, ctx.workspace.id))).returning({ id: holdings.id })
    : tx.insert(holdings).values({ ...values, workspaceId: ctx.workspace.id, assetClass: catalogEntry(values.symbol ?? '')?.kind ?? 'other' }).returning({ id: holdings.id }));
  if (!rows[0]) return NextResponse.json({ error: 'Holding not found in this space.' }, { status: 404 });
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: id ? 'holding.update' : 'holding.create', entity: 'holding', entityId: rows[0].id });
  return NextResponse.json({ ok: true, id: rows[0].id }, { status: id ? 200 : 201 });
}

export function POST(request: Request) { return save(request, false); }
export function PATCH(request: Request) { return save(request, true); }

export async function DELETE(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get('id'));
  if (!id.success) return NextResponse.json({ error: 'Choose a holding to remove.' }, { status: 400 });
  const rows = await withUser(ctx.user.id, (tx) => tx.delete(holdings).where(and(eq(holdings.id, id.data), eq(holdings.workspaceId, ctx.workspace.id))).returning({ id: holdings.id }));
  if (!rows[0]) return NextResponse.json({ error: 'Holding not found in this space.' }, { status: 404 });
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'holding.delete', entity: 'holding', entityId: rows[0].id });
  return NextResponse.json({ ok: true });
}

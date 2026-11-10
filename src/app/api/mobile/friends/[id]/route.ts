import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { removeIou, settleIou } from '@/lib/data/friends';

export const dynamic = 'force-dynamic';

const body = z.object({ transactionId: z.string().uuid().nullable().optional() });

/** "I paid them back", optionally the bank payment that did it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the details.' }, { status: 400 });
  const r = await settleIou({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, id, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}

/** Remove an "I owe" entered by mistake, with the spending it booked. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const ok = await removeIou({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

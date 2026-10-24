import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { clearShare, setShare } from '@/lib/data/cost-shares';
import { audit } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const body = z.object({
  kind: z.enum(['split', 'covered']),
  people: z.number().int().min(2).max(50).nullable().optional(),
  /** Your part in dollars, for an uneven split. */
  mine: z.number().nonnegative().max(10_000_000).nullable().optional(),
  expectBack: z.boolean(),
  withWhom: z.string().max(200).nullable().optional(),
});

/** Split this purchase, or change how it is split. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the split and try again.' }, { status: 400 });
  const { mine, ...rest } = parsed.data;

  const result = await setShare({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, id, {
    ...rest,
    mineMinor: mine === null || mine === undefined ? null : Math.round(mine * 100),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'transaction.split', entity: 'transaction', entityId: id, metadata: { kind: rest.kind } });
  return NextResponse.json({ share: result.share });
}

/** Not split any more: the whole purchase is yours again. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  await clearShare({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, id);
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'transaction.unsplit', entity: 'transaction', entityId: id, metadata: {} });
  return NextResponse.json({ share: null });
}

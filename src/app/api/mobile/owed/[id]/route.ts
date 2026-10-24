import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { recordPayback, removePayback } from '@/lib/data/cost-shares';

export const dynamic = 'force-dynamic';

const body = z.object({
  /** Dollars. Missing means "all of what's left". */
  amount: z.number().positive().max(10_000_000).nullable().optional(),
  /** The deposit it came in as, so that deposit is not counted as income. */
  transactionId: z.string().uuid().nullable().optional(),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Money came back for this split. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the amount and try again.' }, { status: 400 });
  const { amount, ...rest } = parsed.data;
  const result = await recordPayback({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, id, {
    ...rest,
    amountMinor: amount === null || amount === undefined ? null : Math.round(amount * 100),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ share: result.share });
}

/** Undo one payback: DELETE ?repayment=<id>. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  const repayment = new URL(request.url).searchParams.get('repayment') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(repayment)) return NextResponse.json({ error: 'Which payback?' }, { status: 400 });
  const share = await removePayback({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, id, repayment);
  if (!share) return NextResponse.json({ error: 'That split could not be found.' }, { status: 404 });
  return NextResponse.json({ share });
}

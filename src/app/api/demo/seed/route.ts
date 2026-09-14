import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { seedDemoData, hasAnyTransactions } from '@/lib/data/demo';
import { todayIn } from '@/lib/finance/period';
import { audit } from '@/lib/auth/session';

export async function POST() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  if (await hasAnyTransactions(ctx.user.id, ctx.workspace.id)) {
    return NextResponse.json(
      { error: 'This workspace already has transactions. Demo data is only offered for an empty workspace.' },
      { status: 409 },
    );
  }

  const count = await seedDemoData(ctx.user.id, ctx.workspace.id, todayIn(ctx.user.timezone));
  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'demo.seed', entity: 'workspace', entityId: ctx.workspace.id, metadata: { transactions: count },
  });

  return NextResponse.json({ ok: true, transactions: count });
}

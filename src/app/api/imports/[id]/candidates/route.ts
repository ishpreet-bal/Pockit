import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { updateCandidates, acceptAllConfident } from '@/lib/import/commit';

const schema = z.object({
  action: z.enum(['update', 'accept_all_confident']).default('update'),
  confidenceFloor: z.number().min(0).max(100).optional(),
  updates: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(['pending', 'accepted', 'rejected', 'duplicate']).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    postedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    description: z.string().max(300).optional(),
    merchantName: z.string().max(200).optional(),
    amountMinor: z.string().regex(/^-?\d+$/).optional(),
    type: z.enum(['expense', 'income', 'transfer', 'refund', 'investment', 'debt_payment']).optional(),
    businessClassification: z.enum(['personal', 'business']).optional(),
  })).max(500).default([]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);

  if (parsed.data.action === 'accept_all_confident') {
    const count = await acceptAllConfident(repo, id, parsed.data.confidenceFloor ?? 85);
    return NextResponse.json({ ok: true, accepted: count });
  }

  const count = await updateCandidates(repo, id, parsed.data.updates);
  return NextResponse.json({ ok: true, updated: count });
}

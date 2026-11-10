import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { candidateDeposits } from '@/lib/data/cost-shares';
import { addIou, candidatePayments, listFriends } from '@/lib/data/friends';

export const dynamic = 'force-dynamic';

/**
 * Split with friends: each person's balance both ways, plus what the screen needs
 * to settle up (recent deposits and payments to link) and to add "I owe" entries.
 */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const scope = { userId: ctx.user.id, workspaceId: ctx.workspace.id };
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [friends, deposits, payments, cats] = await Promise.all([
    listFriends(scope), candidateDeposits(scope, since), candidatePayments(scope, since),
    withUser(ctx.user.id, (tx) => tx.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories)
      .where(and(eq(categories.workspaceId, ctx.workspace.id), eq(categories.kind, 'expense'), eq(categories.isArchived, false)))),
  ]);
  // Leaf categories only: a purchase belongs in Restaurants, not in Food.
  const parents = new Set(cats.map((c) => c.parentId).filter(Boolean));
  return NextResponse.json({
    ...friends, deposits, payments,
    categories: cats.filter((c) => !parents.has(c.id)).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
  });
}

const body = z.object({
  person: z.string().trim().min(1, 'Who do you owe?').max(80),
  description: z.string().trim().min(1, 'What was it for?').max(200),
  amount: z.number().positive('Enter your part.').max(1_000_000),
  categoryId: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** "Someone paid; I owe them my part." */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the details.' }, { status: 400 });
  const r = await addIou({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, { ...parsed.data, amountMinor: Math.round(parsed.data.amount * 100) });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
}

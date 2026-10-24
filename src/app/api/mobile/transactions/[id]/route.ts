import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { shareForTransaction } from '@/lib/data/cost-shares';
import { minorFromDb, absMinor } from '@/lib/money';

export const dynamic = 'force-dynamic';

/**
 * One transaction for the app's detail screen: what it was, where it sits, and how
 * it is split if it is. Edits go through /api/transactions/[id], as on the website.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;
  const scope = { userId: ctx.user.id, workspaceId: ctx.workspace.id };

  const rows = await withUser(ctx.user.id, (tx) => tx.select().from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.workspaceId, ctx.workspace.id), isNull(transactions.deletedAt)))
    .limit(1));
  const t = rows[0];
  if (!t) return NextResponse.json({ error: 'That transaction could not be found.' }, { status: 404 });

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const [categories, accounts, share] = await Promise.all([repo.listCategories(), repo.listAccounts(), shareForTransaction(scope, id)]);
  const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : undefined;
  const magnitude = Number(absMinor(minorFromDb(t.baseAmountMinor as unknown as string)));
  const incoming = t.type === 'income' || t.type === 'refund';

  return NextResponse.json({
    id: t.id,
    name: t.merchantName ?? t.description,
    date: t.postedDate,
    type: t.type,
    amountMinor: incoming ? magnitude : -magnitude,
    category: cat ? { id: cat.id, name: cat.name } : null,
    account: accounts.find((a) => a.id === t.accountId)?.name ?? null,
    notes: t.notes,
    fromBank: Boolean(t.externalId),
    canSplit: t.type === 'expense',
    share,
    categories: categories
      .filter((c) => c.kind === (incoming ? 'income' : 'expense'))
      .map((c) => ({ id: c.id, name: c.name })),
  });
}

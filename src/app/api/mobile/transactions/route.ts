import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { listShares } from '@/lib/data/cost-shares';
import { todayIn } from '@/lib/finance/period';

export const dynamic = 'force-dynamic';

const MONTH = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * One month of transactions for the app's Spending → See all screen, plus what the
 * "add a purchase" sheet needs (categories and accounts), in one request.
 *
 * Transfers between your own accounts are left out, as they are everywhere else:
 * they are neither spending nor income. Amounts are signed for display — money in
 * positive, money out negative — regardless of how the account stores them.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const params = new URL(request.url).searchParams;
  const requested = params.get('month') ?? '';
  const month = MONTH.test(requested) ? requested : todayIn(ctx.user.timezone).slice(0, 7);
  const q = (params.get('q') ?? '').trim().toLowerCase();

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const [txns, categories, accounts, shares] = await Promise.all([
    repo.listTransactions({ range: monthRange(month), includeSplits: false, includeShares: false }),
    repo.listCategories(),
    repo.listAccounts(),
    listShares({ userId: ctx.user.id, workspaceId: ctx.workspace.id }),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const shareOf = new Map(shares.map((s) => [s.transactionId, s]));

  const rows = txns
    .filter((t) => t.type !== 'transfer')
    .map((t) => {
      const cat = t.categoryId ? byId.get(t.categoryId) : undefined;
      const magnitude = Math.abs(Number(t.baseAmountMinor));
      const incoming = t.type === 'income' || t.type === 'refund';
      return {
        id: t.id,
        name: t.merchantName ?? t.description,
        date: t.postedDate,
        amountMinor: incoming ? magnitude : -magnitude,
        category: cat?.name ?? null,
        icon: cat?.icon ?? null,
        split: (() => {
          const s = shareOf.get(t.id);
          return s ? { label: s.label, mineMinor: s.mineMinor, owedMinor: s.owedMinor } : null;
        })(),
      };
    })
    .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.category ?? '').toLowerCase().includes(q));

  return NextResponse.json({
    month,
    transactions: rows,
    totals: {
      outMinor: rows.filter((r) => r.amountMinor < 0).reduce((s, r) => s - r.amountMinor, 0),
      inMinor: rows.filter((r) => r.amountMinor > 0).reduce((s, r) => s + r.amountMinor, 0),
    },
    categories: categories
      .filter((c) => c.kind === 'expense' || c.kind === 'income')
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind, parentId: c.parentId })),
    accounts: accounts
      .filter((a) => a.isActive)
      .map((a) => ({ id: a.id, name: a.name, type: a.type })),
  });
}

import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { todayIn } from '@/lib/finance/period';
import { computeTrends } from '@/lib/finance/trends';

export const dynamic = 'force-dynamic';

/** The last six months of spending by category, and what's changed. */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const today = todayIn(ctx.user.timezone);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const startDate = new Date(Date.UTC(y, m - 1 - 5, 1)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const range = { start: startDate, end: endDate };
  const [txns, cats] = await Promise.all([repo.listTransactions({ range }), repo.listCategories()]);
  return NextResponse.json(computeTrends(txns, cats, range, today));
}

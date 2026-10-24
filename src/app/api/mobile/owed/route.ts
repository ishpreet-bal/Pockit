import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { candidateDeposits, listShares } from '@/lib/data/cost-shares';

export const dynamic = 'force-dynamic';

/**
 * Owed to you: every split expense still waiting on money, the total, recently
 * squared-up ones, and recent deposits a payback could be matched to.
 */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const scope = { userId: ctx.user.id, workspaceId: ctx.workspace.id };
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [shares, deposits] = await Promise.all([listShares(scope), candidateDeposits(scope, since)]);
  const open = shares.filter((s) => s.owedMinor > 0);
  return NextResponse.json({
    owedMinor: open.reduce((sum, s) => sum + s.owedMinor, 0),
    open,
    settled: shares.filter((s) => s.owedMinor === 0).slice(0, 20),
    deposits,
  });
}

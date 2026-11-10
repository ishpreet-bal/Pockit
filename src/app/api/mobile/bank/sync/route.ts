import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { bankConnections } from '@/lib/db/schema';
import { plaidConfigured } from '@/lib/bank/plaid';
import { syncConnection } from '@/lib/bank/sync';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Refresh every connected bank. One failing bank doesn't stop the others. */
export async function POST() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  if (!plaidConfigured()) return NextResponse.json({ synced: [] });
  if (!(await checkRateLimit(`bank-sync:${ctx.user.id}`, 30, 60 * 60)).allowed) return NextResponse.json({ error: 'Too many tries in a short time. Wait a few minutes and try again.' }, { status: 429 });
  const conns = await withUser(ctx.user.id, (tx) => tx.select({ id: bankConnections.id, name: bankConnections.institutionName })
    .from(bankConnections).where(eq(bankConnections.workspaceId, ctx.workspace.id)));
  const synced = [];
  for (const c of conns) {
    try { synced.push({ id: c.id, ok: true, ...(await syncConnection({ userId: ctx.user.id, workspaceId: ctx.workspace.id, currency: ctx.workspace.baseCurrency }, c.id)) }); }
    catch (e) { synced.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : 'Sync failed' }); }
  }
  return NextResponse.json({ synced });
}

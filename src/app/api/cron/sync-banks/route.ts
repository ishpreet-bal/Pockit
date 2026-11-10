import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { env } from '@/lib/env';
import { withoutUser } from '@/lib/db/client';
import { bankConnections, workspaces } from '@/lib/db/schema';
import { plaidConfigured } from '@/lib/bank/plaid';
import { syncConnection } from '@/lib/bank/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily: bring every connected bank up to date, so the morning's numbers include
 * yesterday without anyone pressing Sync. Each bank syncs as its space's owner,
 * so row-level security applies exactly as when they sync it themselves. One
 * failing bank never stops the rest; its status says it needs attention.
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!plaidConfigured()) return NextResponse.json({ ok: true, synced: 0, failed: 0 });

  const conns = await withoutUser((tx) => tx.select({
    id: bankConnections.id, workspaceId: bankConnections.workspaceId,
    owner: workspaces.ownerUserId, currency: workspaces.baseCurrency,
  }).from(bankConnections).innerJoin(workspaces, eq(workspaces.id, bankConnections.workspaceId)));

  const started = Date.now();
  let synced = 0, failed = 0, skipped = 0;
  for (const c of conns) {
    // Leave room to answer before the function's time is up; the rest go tomorrow.
    if (Date.now() - started > 50_000) { skipped++; continue; }
    try { await syncConnection({ userId: c.owner, workspaceId: c.workspaceId, currency: c.currency }, c.id); synced++; }
    catch { failed++; }
  }
  return NextResponse.json({ ok: true, synced, failed, skipped });
}

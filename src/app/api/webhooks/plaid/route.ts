import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { bankConnections, workspaces } from '@/lib/db/schema';
import { plaidConfigured, verifyPlaidWebhook } from '@/lib/bank/plaid';
import { syncConnection } from '@/lib/bank/sync';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Plaid says a bank has new transactions: sync that bank now, so a purchase shows
 * up in Pockit minutes after it posts instead of the next morning.
 *
 * Only a message signed by Plaid is acted on (see verifyPlaidWebhook), and the only
 * thing it can cause is an ordinary sync of a bank that's already connected.
 */
export async function POST(request: Request) {
  if (!plaidConfigured()) return NextResponse.json({ ok: true });
  const raw = await request.text();
  if (!(await verifyPlaidWebhook(raw, request.headers.get('plaid-verification')))) {
    return NextResponse.json({ error: 'Not verified' }, { status: 401 });
  }
  let body: { webhook_type?: string; webhook_code?: string; item_id?: string };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad body' }, { status: 400 }); }

  const wantsSync = body.webhook_type === 'TRANSACTIONS' && ['SYNC_UPDATES_AVAILABLE', 'DEFAULT_UPDATE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE'].includes(body.webhook_code ?? '')
    || (body.webhook_type === 'LIABILITIES' && body.webhook_code === 'DEFAULT_UPDATE');
  if (!wantsSync || !body.item_id) return NextResponse.json({ ok: true, ignored: true });
  if (!(await checkRateLimit(`plaid-webhook:${body.item_id}`, 30, 60 * 60)).allowed) return NextResponse.json({ ok: true, throttled: true });

  const conns = await withoutUser((tx) => tx.select({
    id: bankConnections.id, workspaceId: bankConnections.workspaceId, owner: workspaces.ownerUserId, currency: workspaces.baseCurrency,
  }).from(bankConnections).innerJoin(workspaces, eq(workspaces.id, bankConnections.workspaceId)).where(eq(bankConnections.itemId, body.item_id!)));
  for (const c of conns) {
    try { await syncConnection({ userId: c.owner, workspaceId: c.workspaceId, currency: c.currency }, c.id); }
    catch { /* the connection's status records what went wrong */ }
  }
  return NextResponse.json({ ok: true, synced: conns.length });
}

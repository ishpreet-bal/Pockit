import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { and, eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { bankConnections } from '@/lib/db/schema';
import { createLinkToken, linkTicket, openToken, plaidConfigured, PlaidError, TokenUnreadable } from '@/lib/bank/plaid';
import { GUEST_BLOCKED_MESSAGE } from '@/lib/auth/guest';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Start connecting a bank: a Plaid Link session and the secure page to open for it.
 * With `{ connectionId }` it is the same bank signing in again (Plaid's update mode),
 * which keeps its accounts and history instead of adding the bank a second time.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  if (ctx.user.isGuest) return NextResponse.json({ error: GUEST_BLOCKED_MESSAGE, guest: true }, { status: 403 });
  if (!plaidConfigured()) return NextResponse.json({ error: 'Bank connection isn’t switched on yet.', notConfigured: true }, { status: 503 });
  if (!(await checkRateLimit(`bank-link:${ctx.user.id}`, 15, 60 * 60)).allowed) return NextResponse.json({ error: 'Too many tries in a short time. Wait a few minutes and try again.' }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { connectionId?: unknown } | null;
  const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : null;
  let accessToken: string | undefined;
  if (connectionId) {
    const conn = (await withUser(ctx.user.id, (tx) => tx.select({ token: bankConnections.accessTokenEnc }).from(bankConnections)
      .where(and(eq(bankConnections.id, connectionId), eq(bankConnections.workspaceId, ctx.workspace.id))).limit(1)))[0];
    if (!conn) return NextResponse.json({ error: 'That bank isn’t connected any more.' }, { status: 404 });
    try { accessToken = openToken(conn.token, ctx.workspace.id); }
    catch (e) {
      if (e instanceof TokenUnreadable) return NextResponse.json({ error: 'This bank has to be connected again from the start: disconnect it, then connect it again.' }, { status: 409 });
      throw e;
    }
  }
  try {
    const r = await createLinkToken(ctx.user.id, { hosted: true, accessToken });
    return NextResponse.json({ linkToken: r.link_token, ticket: linkTicket(r.link_token, ctx.user.id, ctx.workspace.id), url: r.hosted_link_url ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof PlaidError ? e.message : 'Couldn’t start the bank connection.' }, { status: 502 });
  }
}

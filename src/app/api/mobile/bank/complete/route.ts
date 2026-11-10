import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { bankConnections } from '@/lib/db/schema';
import { exchangePublicToken, linkFinished, linkResult, linkTicketValid, plaidConfigured, sealToken, PlaidError } from '@/lib/bank/plaid';
import { syncConnection } from '@/lib/bank/sync';
import { GUEST_BLOCKED_MESSAGE } from '@/lib/auth/guest';
import { audit } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({ linkToken: z.string().min(10).max(200), ticket: z.string().min(20).max(100), connectionId: z.string().uuid().optional() });

/**
 * After the person finishes on the bank's page: collect the result, store the
 * connection (token encrypted), and run the first sync. If they haven't finished
 * yet, say so — the app asks again.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  if (ctx.user.isGuest) return NextResponse.json({ error: GUEST_BLOCKED_MESSAGE, guest: true }, { status: 403 });
  if (!plaidConfigured()) return NextResponse.json({ error: 'Bank connection isn’t switched on yet.' }, { status: 503 });
  // The app asks every two seconds while someone signs in to their bank.
  if (!(await checkRateLimit(`bank-complete:${ctx.user.id}`, 300, 60 * 60)).allowed) return NextResponse.json({ error: 'Too many tries in a short time. Wait a few minutes and try again.' }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Missing link session.' }, { status: 400 });
  if (!linkTicketValid(parsed.data.ticket, parsed.data.linkToken, ctx.user.id, ctx.workspace.id)) {
    return NextResponse.json({ error: 'That bank sign-in was started somewhere else. Start again from Connect a bank.' }, { status: 403 });
  }
  const ledger = { userId: ctx.user.id, workspaceId: ctx.workspace.id, currency: ctx.workspace.baseCurrency };
  if (parsed.data.connectionId) {
    // Signing in again: nothing new to store. Once they've finished, a sync proves it worked.
    try {
      if (!(await linkFinished(parsed.data.linkToken))) return NextResponse.json({ done: false });
      const synced = await syncConnection(ledger, parsed.data.connectionId);
      await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'bank.reconnect', entity: 'bank_connection', entityId: parsed.data.connectionId });
      return NextResponse.json({ done: true, institution: null, synced });
    } catch (e) {
      return NextResponse.json({ error: e instanceof PlaidError ? `Your bank still isn’t letting Pockit in: ${e.message}` : 'That didn’t work. Try signing in again.' }, { status: 502 });
    }
  }
  try {
    const result = await linkResult(parsed.data.linkToken);
    if (!result) return NextResponse.json({ done: false });
    const { access_token, item_id } = await exchangePublicToken(result.publicToken);
    const made = await withUser(ctx.user.id, (tx) => tx.insert(bankConnections).values({
      workspaceId: ctx.workspace.id, itemId: item_id, accessTokenEnc: sealToken(access_token, ctx.workspace.id), institutionName: result.institution,
    }).onConflictDoNothing().returning({ id: bankConnections.id }));
    const id = made[0]?.id;
    // Plaid hands out each login once; seeing it again means it is already here.
    if (!id) return NextResponse.json({ done: true, institution: result.institution, synced: null, alreadyConnected: true });
    await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'bank.connect', entity: 'bank_connection', entityId: id, metadata: { institution: result.institution } });
    const synced = await syncConnection(ledger, id);
    return NextResponse.json({ done: true, institution: result.institution, synced });
  } catch (e) {
    return NextResponse.json({ error: e instanceof PlaidError ? e.message : 'The bank connected, but the first sync failed. Pull to refresh to try again.' }, { status: 502 });
  }
}

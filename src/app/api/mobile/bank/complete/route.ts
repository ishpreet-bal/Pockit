import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { bankConnections } from '@/lib/db/schema';
import { exchangePublicToken, linkResult, plaidConfigured, sealToken, PlaidError } from '@/lib/bank/plaid';
import { syncConnection } from '@/lib/bank/sync';
import { GUEST_BLOCKED_MESSAGE } from '@/lib/auth/guest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({ linkToken: z.string().min(10).max(200) });

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
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Missing link session.' }, { status: 400 });
  try {
    const result = await linkResult(parsed.data.linkToken);
    if (!result) return NextResponse.json({ done: false });
    const { access_token, item_id } = await exchangePublicToken(result.publicToken);
    const made = await withUser(ctx.user.id, (tx) => tx.insert(bankConnections).values({
      workspaceId: ctx.workspace.id, itemId: item_id, accessTokenEnc: sealToken(access_token), institutionName: result.institution,
    }).onConflictDoNothing().returning({ id: bankConnections.id }));
    const id = made[0]?.id;
    const synced = id ? await syncConnection({ userId: ctx.user.id, workspaceId: ctx.workspace.id, currency: ctx.workspace.baseCurrency }, id) : null;
    return NextResponse.json({ done: true, institution: result.institution, synced });
  } catch (e) {
    return NextResponse.json({ error: e instanceof PlaidError ? e.message : 'The bank connected, but the first sync failed. Pull to refresh to try again.' }, { status: 502 });
  }
}

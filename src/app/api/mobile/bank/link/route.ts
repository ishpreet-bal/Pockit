import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { createLinkToken, plaidConfigured, PlaidError } from '@/lib/bank/plaid';
import { GUEST_BLOCKED_MESSAGE } from '@/lib/auth/guest';

export const dynamic = 'force-dynamic';

/** Start connecting a bank: a Plaid Link session and the secure page to open for it. */
export async function POST() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  if (ctx.user.isGuest) return NextResponse.json({ error: GUEST_BLOCKED_MESSAGE, guest: true }, { status: 403 });
  if (!plaidConfigured()) return NextResponse.json({ error: 'Bank connection isn’t switched on yet.', notConfigured: true }, { status: 503 });
  try {
    const r = await createLinkToken(ctx.user.id, { hosted: true });
    return NextResponse.json({ linkToken: r.link_token, url: r.hosted_link_url ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof PlaidError ? e.message : 'Couldn’t start the bank connection.' }, { status: 502 });
  }
}

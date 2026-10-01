import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/lib/env';
import { setPlus } from '@/lib/billing/plan';
import { audit } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * RevenueCat webhook: the App Store's word on who has Pockit Plus.
 *
 * The app tells RevenueCat the Pockit user id when someone subscribes, so every
 * event here names a Pockit user directly. Only events carrying the shared secret
 * are accepted — without it anyone could POST "this person paid".
 *
 * The server never trusts the phone about payment. The phone only ever reads its
 * plan back from /api/mobile/me.
 */
const GRANTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']);
// A cancellation keeps Plus until the paid period ends; these are when it actually stops.
const ENDS = new Set(['EXPIRATION']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const eventSchema = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string(),
    expiration_at_ms: z.number().nullable().optional(),
    environment: z.string().optional(),
  }),
});

function authorised(header: string | null) {
  const secret = env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorised(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad event' }, { status: 400 });
  const { type, app_user_id: userId, expiration_at_ms: expires } = parsed.data.event;

  // Anonymous RevenueCat ids ($RCAnonymousID:…) belong to nobody yet; acknowledge and move on.
  if (!UUID.test(userId)) return NextResponse.json({ ok: true, ignored: 'not a Pockit user id' });

  let until: Date | null | undefined;
  if (GRANTS.has(type)) until = expires ? new Date(expires) : new Date(Date.now() + 31 * 86_400_000);
  else if (ENDS.has(type)) until = new Date();
  else return NextResponse.json({ ok: true, ignored: type }); // e.g. CANCELLATION, BILLING_ISSUE: nothing changes yet

  const found = await setPlus(userId, until, 'app_store');
  await audit({ actorUserId: userId, action: `billing.${type.toLowerCase()}`, entity: 'user', entityId: userId, metadata: { until: until?.toISOString() ?? null } });
  // 200 even for an unknown user, so RevenueCat doesn't retry forever on a deleted account.
  return NextResponse.json({ ok: true, applied: found });
}

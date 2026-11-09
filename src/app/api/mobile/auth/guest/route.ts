import { NextResponse } from 'next/server';
import { createGuest } from '@/lib/auth/guest';
import { audit, issueSessionToken, requestContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** "Look around first" in the app: a guest account with sample money, and its session. */
export async function POST() {
  const { ip, userAgent } = await requestContext();
  const made = await createGuest(ip);
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
  const token = await issueSessionToken(made.userId, ip, userAgent);
  await audit({ actorUserId: made.userId, action: 'auth.guest_app', entity: 'user', entityId: made.userId });
  return NextResponse.json({ token }, { status: 201 });
}

import { NextResponse } from 'next/server';
import { createGuest } from '@/lib/auth/guest';
import { audit, issueSessionToken, requestContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** "Look around first" in the app: a guest account with sample money, and its session. */
export async function POST() {
  const { ip, userAgent } = await requestContext();
  let made: Awaited<ReturnType<typeof createGuest>>;
  try {
    made = await createGuest(ip);
  } catch (error) {
    // Usually a database not yet updated for this version. The app falls back to
    // its offline samples; the owner sees the reason in the logs and on /setup.
    console.error('Guest account failed', error);
    return NextResponse.json({ error: 'Looking around isn’t available right now. Try again soon.' }, { status: 503 });
  }
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
  const token = await issueSessionToken(made.userId, ip, userAgent);
  await audit({ actorUserId: made.userId, action: 'auth.guest_app', entity: 'user', entityId: made.userId });
  return NextResponse.json({ token }, { status: 201 });
}

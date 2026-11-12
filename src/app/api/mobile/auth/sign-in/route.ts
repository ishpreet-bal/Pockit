import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCredentials } from '@/lib/auth/credentials';
import { dropPresentedGuest } from '@/lib/auth/guest';
import { issueSessionToken, audit, requestContext } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { twoFactorEnabled, verifySecondFactor, consumeRecoveryCode } from '@/lib/auth/two-factor';

export const dynamic = 'force-dynamic';

const body = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(200),
  /** Only on the second attempt, once the app has been told a code is needed. */
  code: z.string().trim().max(40).optional(),
});

/**
 * Sign in from the iPhone app. Returns a session token instead of setting a cookie.
 *
 * Two-factor is stateless here: the first call answers `needsSecondFactor`, and the
 * app repeats the call with the code. The password is checked again each time, so
 * nothing half-authenticated is ever stored.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.email || !parsed.data.password) {
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  }
  const { email, password, code } = parsed.data;

  const { ip, userAgent } = await requestContext();
  const limit = await checkRateLimit(`signin:${ip ?? 'unknown'}`, 10, 15 * 60);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });

  const checked = await checkCredentials(email, password);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 401 });
  const userId = checked.userId;

  if (await twoFactorEnabled(userId)) {
    if (!code) return NextResponse.json({ needsSecondFactor: true });
    const codeLimit = await checkRateLimit(`2fa:${userId}:${ip ?? 'unknown'}`, 10, 15 * 60);
    if (!codeLimit.allowed) return NextResponse.json({ error: 'Too many codes tried. Try again in a few minutes.' }, { status: 429 });
    const recovery = /[a-z]/i.test(code);
    const outcome = recovery ? ((await consumeRecoveryCode(userId, code)) ? 'ok' : 'invalid') : await verifySecondFactor(userId, code);
    if (outcome !== 'ok') {
      await audit({ actorUserId: userId, action: 'auth.second_factor_failed', entity: 'user', entityId: userId });
      return NextResponse.json({
        needsSecondFactor: true,
        error: outcome === 'already-used'
          ? 'That code has already been used. Wait for the next one.'
          : 'That code is not right. Codes change every 30 seconds — try the current one.',
      }, { status: 401 });
    }
  }

  await dropPresentedGuest();
  const token = await issueSessionToken(userId, ip, userAgent);
  await audit({ actorUserId: userId, action: 'auth.sign_in_app', entity: 'user', entityId: userId });
  return NextResponse.json({ token });
}

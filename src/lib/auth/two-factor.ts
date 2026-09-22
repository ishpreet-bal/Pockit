import 'server-only';
import { cookies } from 'next/headers';
import { and, eq, isNull } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { userTotp, recoveryCodes } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { sign, unsign, hashToken } from './password';
import { decryptSecret, verifyCode, normaliseRecoveryCode } from './totp';

const PENDING_COOKIE = 'pockit_2fa';
/** Five minutes is long enough to open an authenticator app and short enough to matter. */
const PENDING_SECONDS = 300;

/**
 * The gap between "password was right" and "you are signed in".
 *
 * A half-authenticated state has to live somewhere, and the options are a server
 * session or a signed cookie. A session would mean a row that IS a login as far as
 * every other query is concerned, one bug away from being honoured. The signed
 * cookie carries no authority on its own: it names a user and an expiry, and the
 * only thing that accepts it is the code below.
 */
export async function startPendingTwoFactor(userId: string): Promise<void> {
  const payload = `${userId}.${Date.now() + PENDING_SECONDS * 1000}`;
  const jar = await cookies();
  jar.set(PENDING_COOKIE, sign(payload, env.AUTH_SECRET), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_SECONDS,
  });
}

export async function readPendingTwoFactor(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(PENDING_COOKIE)?.value;
  if (!raw) return null;

  const payload = unsign(raw, env.AUTH_SECRET);
  if (!payload) return null;

  const [userId, expiry] = payload.split('.');
  if (!userId || !expiry) return null;
  if (Number(expiry) < Date.now()) return null;
  return userId;
}

export async function clearPendingTwoFactor(): Promise<void> {
  const jar = await cookies();
  jar.delete(PENDING_COOKIE);
}

/** Is this account protected by a CONFIRMED second factor? An unconfirmed one is not a factor. */
export async function twoFactorEnabled(userId: string): Promise<boolean> {
  const rows = await withoutUser((tx) =>
    tx.select({ confirmedAt: userTotp.confirmedAt }).from(userTotp).where(eq(userTotp.userId, userId)).limit(1),
  );
  return Boolean(rows[0]?.confirmedAt);
}

export type SecondFactorResult = 'ok' | 'invalid' | 'already-used' | 'not-enrolled';

/**
 * Check a six-digit code, and record the step so it cannot be used twice.
 *
 * Runs `withoutUser`, because at this point there is no session to scope by — the
 * whole purpose of the call is to decide whether there should be one. Every query
 * below is therefore pinned to the user id from the signed pending cookie.
 */
export async function verifySecondFactor(userId: string, code: string): Promise<SecondFactorResult> {
  const rows = await withoutUser((tx) =>
    tx.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1),
  );
  const row = rows[0];
  if (!row?.confirmedAt) return 'not-enrolled';

  const secret = decryptSecret(row.secretEncrypted);
  if (!secret) return 'invalid';

  const result = verifyCode(secret, code, row.lastUsedStep);
  if (!result.ok) return result.alreadyUsed ? 'already-used' : 'invalid';

  await withoutUser((tx) =>
    tx.update(userTotp).set({ lastUsedStep: result.step }).where(eq(userTotp.userId, userId)),
  );
  return 'ok';
}

/**
 * Spend a recovery code.
 *
 * Marked used rather than deleted, so "you have 7 codes left" stays true and a
 * reused one is refused rather than silently missing. Hashes are compared, never
 * the codes themselves.
 */
export async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
  const cleaned = normaliseRecoveryCode(input);
  if (cleaned.length < 6) return false;

  const hash = hashToken(cleaned);
  const updated = await withoutUser((tx) =>
    tx.update(recoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, hash),
        isNull(recoveryCodes.usedAt),
      ))
      .returning({ id: recoveryCodes.id }),
  );
  return updated.length > 0;
}

import 'server-only';
import { eq } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { findUserByEmail } from '@/lib/data/bootstrap';
import { verifyPassword } from './password';
import { audit } from './session';

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export type CredentialCheck = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Email and password, checked once, for both the website and the iPhone app.
 *
 * Always runs a hash comparison so a missing account and a wrong password take the
 * same time; counts failures and locks the account after several.
 */
export async function checkCredentials(email: string, password: string): Promise<CredentialCheck> {
  const user = await findUserByEmail(email);
  const stored = user?.passwordHash ?? '$scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA';
  const valid = await verifyPassword(password, stored);

  if (!user || !valid || user.deletedAt) {
    if (user) {
      const failed = user.failedLoginCount + 1;
      await withoutUser((tx) =>
        tx.update(users).set({
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
        }).where(eq(users.id, user.id)),
      );
      await audit({ actorUserId: user.id, action: 'auth.sign_in_failed', entity: 'user', entityId: user.id });
    }
    return { ok: false, error: 'Email or password is incorrect.' };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: 'This account is temporarily locked after several failed attempts. Try again shortly.' };
  }

  await withoutUser((tx) =>
    tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id)),
  );
  return { ok: true, userId: user.id };
}

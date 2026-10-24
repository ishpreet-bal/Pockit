import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { passwordResets, sessions, users } from '@/lib/db/schema';
import { hashPassword } from './password';
import { findUserByEmail } from '@/lib/data/bootstrap';
import { env } from '@/lib/env';
import { sendEmail, emailConfigured } from '@/lib/email';

const HOUR = 60 * 60 * 1000;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Email a reset link if the address has an account. The caller answers the same
 * either way, so this cannot be used to find out who has an account.
 */
export async function requestReset(email: string): Promise<'sent' | 'not_configured'> {
  if (!emailConfigured()) return 'not_configured';
  const user = await findUserByEmail(email);
  if (!user || user.deletedAt) return 'sent';

  const token = randomBytes(32).toString('base64url');
  await withoutUser((tx) => tx.insert(passwordResets).values({ tokenHash: hash(token), userId: user.id, expiresAt: new Date(Date.now() + HOUR) }));

  const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your Pockit password',
    text: `Someone (hopefully you) asked to reset the password for your Pockit account.\n\nChoose a new password here: ${link}\n\nThe link works once, for the next hour. If you didn't ask for this, ignore this email; your password hasn't changed.`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1c1a15;max-width:480px">
<p>Someone (hopefully you) asked to reset the password for your Pockit account.</p>
<p><a href="${link}" style="display:inline-block;background:#da5100;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Choose a new password</a></p>
<p style="color:#6d685b;font-size:14px">The link works once, for the next hour. If you didn't ask for this, ignore this email; your password hasn't changed.</p></div>`,
  });
  return 'sent';
}

export type ResetResult = { ok: true } | { ok: false; error: string };

/** Set a new password from a link. Signs the account out everywhere. */
export async function completeReset(token: string, password: string): Promise<ResetResult> {
  const now = new Date();
  const rows = await withoutUser((tx) => tx.select().from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, hash(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now))).limit(1));
  const reset = rows[0];
  if (!reset) return { ok: false, error: 'This link has expired or was already used. Ask for a new one.' };

  const passwordHash = await hashPassword(password);
  await withoutUser(async (tx) => {
    await tx.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.tokenHash, reset.tokenHash));
    await tx.update(users).set({ passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: now }).where(eq(users.id, reset.userId));
    // Anyone who was signed in with the old password is signed out.
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
  });
  return { ok: true };
}

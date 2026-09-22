import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { requireAuthApi } from '@/lib/auth/api';
import { withoutUser } from '@/lib/db/client';
import { userTotp, recoveryCodes } from '@/lib/db/schema';
import { hashToken, verifyPassword } from '@/lib/auth/password';
import { users } from '@/lib/db/schema';
import { audit } from '@/lib/auth/session';
import {
  generateSecret, otpauthUri, encryptSecret, decryptSecret, verifyCode, generateRecoveryCodes,
  normaliseRecoveryCode,
} from '@/lib/auth/totp';

export const dynamic = 'force-dynamic';

/** Current state. Never returns the secret once enrolment is confirmed. */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const rows = await withoutUser((tx) =>
    tx.select().from(userTotp).where(eq(userTotp.userId, ctx.user.id)).limit(1),
  );
  const codes = await withoutUser((tx) =>
    tx.select({ usedAt: recoveryCodes.usedAt }).from(recoveryCodes).where(eq(recoveryCodes.userId, ctx.user.id)),
  );

  return NextResponse.json({
    enabled: Boolean(rows[0]?.confirmedAt),
    pending: Boolean(rows[0] && !rows[0].confirmedAt),
    recoveryCodesLeft: codes.filter((c) => c.usedAt === null).length,
  });
}

/**
 * Begin enrolment: make a secret and show it as a QR code.
 *
 * The row is written unconfirmed. Nothing about signing in changes until a correct
 * code proves the authenticator actually has the secret — enrolling on the strength
 * of "I scanned it" is how people lock themselves out of their own accounts.
 *
 * Starting again replaces any unconfirmed secret, so a half-finished attempt cannot
 * leave a stale one lying around.
 */
export async function POST() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const existing = await withoutUser((tx) =>
    tx.select({ confirmedAt: userTotp.confirmedAt }).from(userTotp).where(eq(userTotp.userId, ctx.user.id)).limit(1),
  );
  if (existing[0]?.confirmedAt) {
    return NextResponse.json({ error: 'Two-step verification is already on for this account.' }, { status: 409 });
  }

  const secret = generateSecret();
  const uri = otpauthUri(secret, ctx.user.email);

  await withoutUser(async (tx) => {
    await tx.delete(userTotp).where(eq(userTotp.userId, ctx.user.id));
    await tx.insert(userTotp).values({ userId: ctx.user.id, secretEncrypted: encryptSecret(secret) });
  });

  return NextResponse.json({
    // Rendered by the server so the secret never has to travel as a separate value
    // for a client-side QR library to encode.
    qrSvg: await QRCode.toString(uri, { type: 'svg', margin: 0, width: 200 }),
    // Shown for people whose authenticator cannot scan, and nobody else.
    manualKey: secret,
  });
}

/** Confirm enrolment with a real code, and hand back the recovery codes. */
export async function PUT(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = z.object({ code: z.string().trim().min(6).max(10) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter the six-digit code.' }, { status: 400 });

  const rows = await withoutUser((tx) =>
    tx.select().from(userTotp).where(eq(userTotp.userId, ctx.user.id)).limit(1),
  );
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Start again — there is nothing to confirm.' }, { status: 400 });
  if (row.confirmedAt) return NextResponse.json({ error: 'Already on.' }, { status: 409 });

  const secret = decryptSecret(row.secretEncrypted);
  if (!secret) return NextResponse.json({ error: 'Start again — that secret could not be read.' }, { status: 400 });

  const result = verifyCode(secret, parsed.data.code, row.lastUsedStep);
  if (!result.ok) {
    return NextResponse.json(
      { error: 'That code is not right. Codes change every 30 seconds — try the current one.' },
      { status: 400 },
    );
  }

  // Codes are shown ONCE, here, and stored only as hashes. There is deliberately no
  // way to see them again: a list you can re-read is a second password lying around.
  const codes = generateRecoveryCodes();
  await withoutUser(async (tx) => {
    await tx.update(userTotp)
      .set({ confirmedAt: new Date(), lastUsedStep: result.step })
      .where(eq(userTotp.userId, ctx.user.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, ctx.user.id));
    // Hashed through the SAME normaliser that verification uses. Writing the
    // stripping out by hand here would work today and drift tomorrow — and the
    // symptom of that drift is every recovery code being rejected, discovered by
    // someone who has already lost their phone.
    await tx.insert(recoveryCodes).values(
      codes.map((code) => ({ userId: ctx.user.id, codeHash: hashToken(normaliseRecoveryCode(code)) })),
    );
  });

  await audit({ actorUserId: ctx.user.id, action: 'auth.two_factor_enabled', entity: 'user', entityId: ctx.user.id });
  return NextResponse.json({ ok: true, recoveryCodes: codes });
}

/**
 * Turn it off — which requires the account password.
 *
 * Without that, an unlocked laptop is enough to strip the second factor off an
 * account, which would make the feature pointless against the attack it exists for.
 */
export async function DELETE(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = z.object({ password: z.string().min(1) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your password to turn this off.' }, { status: 400 });
  }

  const account = await withoutUser((tx) =>
    tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, ctx.user.id)).limit(1),
  );
  const hash = account[0]?.passwordHash;
  if (!hash || !(await verifyPassword(parsed.data.password, hash))) {
    return NextResponse.json({ error: 'That password is not right.' }, { status: 403 });
  }

  await withoutUser(async (tx) => {
    await tx.delete(userTotp).where(eq(userTotp.userId, ctx.user.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, ctx.user.id));
  });

  await audit({ actorUserId: ctx.user.id, action: 'auth.two_factor_disabled', entity: 'user', entityId: ctx.user.id });
  return NextResponse.json({ ok: true });
}

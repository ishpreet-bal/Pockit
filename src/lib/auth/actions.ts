'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { createUserWithWorkspace, findUserByEmail } from '@/lib/data/bootstrap';
import { verifyPassword } from './password';
import { createSession, destroySession, audit, requestContext } from './session';
import { checkRateLimit } from './rate-limit';

const credentials = z.object({
  email: z.string().trim().email('Enter a valid email address').max(254),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
});

export interface AuthFormState { error?: string; fieldErrors?: Record<string, string> }

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }

  const { ip } = await requestContext();
  const limit = await checkRateLimit(`signup:${ip ?? 'unknown'}`, 5, 60 * 60);
  if (!limit.allowed) return { error: 'Too many sign-up attempts. Please try again later.' };

  const existing = await findUserByEmail(parsed.data.email);
  if (existing) {
    // Do not confirm whether an address is registered.
    return { error: 'That email cannot be used. If you already have an account, sign in instead.' };
  }

  const kindValue = String(formData.get('useCase') ?? 'personal');
  const kinds: ('personal' | 'business')[] =
    kindValue === 'both' ? ['personal', 'business']
    : kindValue === 'business' ? ['business'] : ['personal'];

  const result = await createUserWithWorkspace({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: (formData.get('displayName') as string | null)?.trim() || null,
    baseCurrency: String(formData.get('baseCurrency') ?? 'CAD'),
    timezone: String(formData.get('timezone') ?? 'America/Toronto'),
    kinds,
  });

  const ctx = await requestContext();
  await createSession(result.userId, ctx.ip, ctx.userAgent);
  await audit({ actorUserId: result.userId, action: 'auth.sign_up', entity: 'user', entityId: result.userId });

  redirect('/onboarding');
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const { ip } = await requestContext();
  const limit = await checkRateLimit(`signin:${ip ?? 'unknown'}`, 10, 15 * 60);
  if (!limit.allowed) return { error: 'Too many attempts. Please try again in a few minutes.' };

  const user = await findUserByEmail(email);

  // Always run a hash comparison so a missing account and a wrong password take the
  // same time; otherwise response timing reveals which addresses are registered.
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
    return { error: 'Email or password is incorrect.' };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: 'This account is temporarily locked after several failed attempts. Try again shortly.' };
  }

  await withoutUser((tx) =>
    tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id)),
  );

  const ctx = await requestContext();
  await createSession(user.id, ctx.ip, ctx.userAgent);
  await audit({ actorUserId: user.id, action: 'auth.sign_in', entity: 'user', entityId: user.id });

  redirect('/overview');
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect('/sign-in');
}

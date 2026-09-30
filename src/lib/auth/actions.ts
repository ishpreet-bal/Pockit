'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createUserWithWorkspace, findUserByEmail } from '@/lib/data/bootstrap';
import { createSession, destroySession, audit, requestContext } from './session';
import { checkRateLimit } from './rate-limit';
import { checkCredentials } from './credentials';
import {
  startPendingTwoFactor, readPendingTwoFactor, clearPendingTwoFactor,
  twoFactorEnabled, verifySecondFactor, consumeRecoveryCode,
} from './two-factor';

const credentials = z.object({
  email: z.string().trim().email('Enter a valid email address').max(254),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
});

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set when the failure is the deployment's, not the person's — offers a link to /setup. */
  setupRequired?: boolean;
  /** The password was right and a second factor is now required. */
  needsSecondFactor?: boolean;
}

/**
 * Turns an infrastructure failure into a sentence instead of a stack trace.
 *
 * Signing up is the first thing that writes to the database, so on a fresh deployment
 * it is also the first thing that fails when the schema was never migrated. Without
 * this the person sees "Application error" with a digest hash and no way forward.
 *
 * `redirect()` signals success by throwing, so that throw is re-raised untouched.
 */
async function guarded(run: () => Promise<AuthFormState>): Promise<AuthFormState> {
  try {
    return await run();
  } catch (error) {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')) {
      throw error;
    }
    console.error('auth action failed', error);
    return {
      error: 'This app is not finished setting up yet, so accounts cannot be created or used.',
      setupRequired: true,
    };
  }
}

export async function signUpAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return guarded(() => signUp(prev, formData));
}

async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
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

export async function signInAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return guarded(() => signIn(prev, formData));
}

async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const { ip } = await requestContext();
  const limit = await checkRateLimit(`signin:${ip ?? 'unknown'}`, 10, 15 * 60);
  if (!limit.allowed) return { error: 'Too many attempts. Please try again in a few minutes.' };

  const checked = await checkCredentials(email, password);
  if (!checked.ok) return { error: checked.error };
  const user = { id: checked.userId };

  // The password was right. If a second factor is enrolled, that is not yet a
  // session — it is permission to be ASKED for the code. No session row exists
  // until the second factor passes, so a half-finished login cannot be mistaken
  // for a finished one anywhere else in the app.
  if (await twoFactorEnabled(user.id)) {
    await startPendingTwoFactor(user.id);
    return { needsSecondFactor: true };
  }

  const ctx = await requestContext();
  await createSession(user.id, ctx.ip, ctx.userAgent);
  await audit({ actorUserId: user.id, action: 'auth.sign_in', entity: 'user', entityId: user.id });

  redirect('/overview');
}

export async function secondFactorAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return guarded(() => secondFactor(prev, formData));
}

/**
 * The second step of signing in.
 *
 * Rate limited separately and harder than the password step: a six-digit code has a
 * million possibilities, which is a number you can work through if nobody is
 * counting. Ten attempts per fifteen minutes makes that hopeless.
 */
async function secondFactor(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const userId = await readPendingTwoFactor();
  if (!userId) {
    return { error: 'That took too long. Enter your email and password again.' };
  }

  const { ip } = await requestContext();
  const limit = await checkRateLimit(`2fa:${userId}:${ip ?? 'unknown'}`, 10, 15 * 60);
  if (!limit.allowed) {
    await clearPendingTwoFactor();
    return { error: 'Too many codes tried. Sign in again in a few minutes.' };
  }

  const code = String(formData.get('code') ?? '').trim();
  if (code === '') return { needsSecondFactor: true, error: 'Enter the code from your authenticator app.' };

  // A recovery code is longer than six digits and contains letters, so the two are
  // told apart by shape rather than by asking the person which kind they are using.
  const looksLikeRecovery = /[a-z]/i.test(code);
  const outcome = looksLikeRecovery
    ? ((await consumeRecoveryCode(userId, code)) ? 'ok' : 'invalid')
    : await verifySecondFactor(userId, code);

  if (outcome !== 'ok') {
    await audit({ actorUserId: userId, action: 'auth.second_factor_failed', entity: 'user', entityId: userId });
    return {
      needsSecondFactor: true,
      error:
        outcome === 'already-used'
          // Right code, spent step. Says what to do instead of implying the phone
          // is wrong, which is where people go looking otherwise.
          ? 'That code has already been used. Wait for your app to show the next one.'
          : looksLikeRecovery
            ? 'That recovery code is not valid, or it has already been used.'
            : 'That code is not right. Codes change every 30 seconds — try the current one.',
    };
  }

  await clearPendingTwoFactor();
  const ctx = await requestContext();
  await createSession(userId, ctx.ip, ctx.userAgent);
  await audit({
    actorUserId: userId,
    action: looksLikeRecovery ? 'auth.sign_in_recovery_code' : 'auth.sign_in_second_factor',
    entity: 'user',
    entityId: userId,
  });

  redirect('/overview');
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect('/sign-in');
}

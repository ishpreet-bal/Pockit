import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createUserWithWorkspace, findUserByEmail } from '@/lib/data/bootstrap';
import { dropPresentedGuest } from '@/lib/auth/guest';
import { issueSessionToken, audit, requestContext } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';

const body = z.object({
  firstName: z.string().trim().min(1, 'Tell us what to call you').max(60),
  email: z.string().trim().email('Enter a valid email address').max(254),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
  timezone: z.string().max(60).optional(),
});

/** Create an account from the iPhone app and return a session token. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return NextResponse.json({ fieldErrors }, { status: 400 });
  }

  const { ip, userAgent } = await requestContext();
  const limit = await checkRateLimit(`signup:${ip ?? 'unknown'}`, 5, 60 * 60);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many sign-up attempts. Please try again later.' }, { status: 429 });

  if (await findUserByEmail(parsed.data.email)) {
    // Do not confirm whether an address is registered.
    return NextResponse.json({ error: 'That email cannot be used. If you already have an account, sign in instead.' }, { status: 409 });
  }

  const result = await createUserWithWorkspace({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.firstName,
    baseCurrency: 'CAD',
    timezone: parsed.data.timezone ?? 'America/Toronto',
    kinds: ['personal'],
  });

  await dropPresentedGuest();
  const token = await issueSessionToken(result.userId, ip, userAgent);
  await audit({ actorUserId: result.userId, action: 'auth.sign_up_app', entity: 'user', entityId: result.userId });
  return NextResponse.json({ token }, { status: 201 });
}

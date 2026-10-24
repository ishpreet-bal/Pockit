import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestReset } from '@/lib/auth/password-reset';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { requestContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const body = z.object({ email: z.string().trim().email().max(254) });

/** "Forgot password": the same answer whether or not the email has an account. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter the email you signed up with.' }, { status: 400 });

  const { ip } = await requestContext();
  const byIp = await checkRateLimit(`forgot:ip:${ip ?? 'unknown'}`, 10, 60 * 60);
  const byEmail = await checkRateLimit(`forgot:email:${parsed.data.email.toLowerCase()}`, 3, 60 * 60);
  if (!byIp.allowed || !byEmail.allowed) return NextResponse.json({ error: 'Too many requests. Please try again in an hour.' }, { status: 429 });

  const result = await requestReset(parsed.data.email);
  if (result === 'not_configured') {
    return NextResponse.json({ error: 'Password reset by email isn’t switched on yet. Use Send feedback, or contact support, and we’ll help you get back in.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}

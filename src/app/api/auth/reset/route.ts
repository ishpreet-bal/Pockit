import { NextResponse } from 'next/server';
import { z } from 'zod';
import { completeReset } from '@/lib/auth/password-reset';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { requestContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const body = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
});

export async function POST(request: Request) {
  const { ip } = await requestContext();
  const limit = await checkRateLimit(`reset:ip:${ip ?? 'unknown'}`, 20, 60 * 60);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many tries. Please wait a while.' }, { status: 429 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the new password.' }, { status: 400 });
  const result = await completeReset(parsed.data.token, parsed.data.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

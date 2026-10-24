import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { requireAuthApi } from '@/lib/auth/api';
import { withoutUser } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { deleteAccount, HandoverFailed } from '@/lib/auth/delete-account';

export const dynamic = 'force-dynamic';

const body = z.object({ password: z.string().min(1).max(200) });

/**
 * Delete my account, for good. The password is asked for again so an unlocked
 * phone left on a table cannot be used to wipe someone's records.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const limit = await checkRateLimit(`delete-account:${ctx.user.id}`, 5, 60 * 60);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many tries. Please wait a while and try again.' }, { status: 429 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your password to confirm.' }, { status: 400 });

  const rows = await withoutUser((tx) => tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, ctx.user.id)).limit(1));
  if (!rows[0] || !(await verifyPassword(parsed.data.password, rows[0].hash))) {
    return NextResponse.json({ error: 'That password isn’t right.' }, { status: 403 });
  }

  let result: Awaited<ReturnType<typeof deleteAccount>>;
  try {
    result = await deleteAccount(ctx.user.id);
  } catch (error) {
    if (error instanceof HandoverFailed) {
      return NextResponse.json({ error: 'A shared space you own couldn’t be handed to its other members, so nothing was deleted. Leave or remove that space first, or contact support.' }, { status: 409 });
    }
    throw error;
  }

  // The website's session cookie, if this came from a browser. The phone forgets
  // its own token when it sees this succeed.
  try { (await cookies()).delete('pockit_session'); } catch { /* not a browser request */ }
  return NextResponse.json({ ok: true, ...result });
}

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getSessionUser } from '@/lib/auth/session';
import { isAdminEmail } from '@/lib/billing/plan';
import { getStats } from '@/lib/admin/stats';

export const dynamic = 'force-dynamic';

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** The same counts as /admin, as JSON: for an admin's session, or with the x-admin-secret header. */
export async function GET(request: Request) {
  const secret = process.env.ADMIN_SECRET?.trim();
  const given = request.headers.get('x-admin-secret')?.trim();
  let allowed = Boolean(secret && given && same(given, secret));
  if (!allowed) {
    const user = await getSessionUser().catch(() => null);
    allowed = Boolean(user && isAdminEmail(user.email));
  }
  if (!allowed) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(await getStats());
}

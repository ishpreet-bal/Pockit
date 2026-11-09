import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAuthApi } from '@/lib/auth/api';
import { endGuest } from '@/lib/auth/guest';

export const dynamic = 'force-dynamic';

/**
 * Stop looking around: the guest and its sample money are deleted, so signing up
 * afterwards starts clean. A real account is never touched by this.
 */
export async function POST() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  if (!ctx.user.isGuest) return NextResponse.json({ error: 'Only a guest can be ended this way.' }, { status: 400 });
  await endGuest(ctx.user.id);
  try {
    const jar = await cookies();
    jar.delete('pockit_session');
    jar.delete('pockit_workspace');
  } catch { /* not a browser request */ }
  return NextResponse.json({ ok: true });
}

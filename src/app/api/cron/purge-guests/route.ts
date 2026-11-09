import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { purgeGuests } from '@/lib/auth/guest';

export const dynamic = 'force-dynamic';

/**
 * Daily: delete guest accounts older than a few days. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set it does nothing.
 */
export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const removed = await purgeGuests();
  return NextResponse.json({ ok: true, removed });
}

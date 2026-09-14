import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runMigrations } from '@/lib/db/migrate';
import { env } from '@/lib/env';

export const maxDuration = 60;

/**
 * Applies pending migrations from the deployed environment.
 *
 * Migrations are NOT applied automatically on boot: a schema change during a cold
 * start is how outages happen. This endpoint is called deliberately, once, after a
 * deployment that includes new migration files.
 */
export async function POST(request: Request) {
  const secret = env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'ADMIN_SECRET is not configured, so this endpoint is disabled.' },
      { status: 503 },
    );
  }

  const provided = request.headers.get('x-admin-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runMigrations();
  if (result.failed) {
    return NextResponse.json({ ok: false, ...result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}

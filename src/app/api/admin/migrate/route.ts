import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export const maxDuration = 60;

/**
 * Applies pending migrations from the deployed environment.
 *
 * Migrations are NOT applied automatically on boot: a schema change during a cold
 * start is how outages happen. This endpoint is called deliberately, once, after a
 * deployment that includes new migration files.
 *
 * Everything is imported lazily and inside the try: this route is reached when the
 * deployment is broken, and a module-scope import of `env` would turn an invalid
 * configuration into an opaque 500 instead of the sentence that explains it.
 */
export async function POST(request: Request) {
  let env: typeof import('@/lib/env')['env'];
  try {
    ({ env } = await import('@/lib/env'));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Environment configuration is invalid' },
      { status: 503 },
    );
  }

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
    return NextResponse.json({ error: 'That setup key is not correct.' }, { status: 401 });
  }

  try {
    const { runMigrations } = await import('@/lib/db/migrate');
    const result = await runMigrations(env.DATABASE_URL);
    if (result.failed) {
      return NextResponse.json({ ok: false, ...result }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export const maxDuration = 60;

/**
 * Compares the key the way a person pastes it, not the way a byte comparison wants it.
 *
 * A value copied out of a dashboard routinely carries a trailing newline or the quotes
 * from a `KEY="value"` line, and a byte-exact `timingSafeEqual` then rejects a key the
 * person can plainly see is right, with no clue as to why. Trimming both sides
 * identically cannot weaken the check: the secret is still compared in full, in
 * constant time, and an empty result is rejected before any comparison happens.
 */
function normalizeSecret(raw: string): string {
  const trimmed = raw.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.trim();
}

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

  const secret = normalizeSecret(env.ADMIN_SECRET ?? '');
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'ADMIN_SECRET is not set on this deployment, so setup cannot run. Add it in your ' +
          'hosting dashboard and redeploy — an environment variable only takes effect on a new deployment.',
      },
      { status: 503 },
    );
  }

  const provided = normalizeSecret(request.headers.get('x-admin-secret') ?? '');
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      {
        error:
          'That setup key does not match this deployment. Two things cause this far more often ' +
          'than a typo: the variable was changed without redeploying afterwards (it only takes ' +
          'effect on a new deployment), or it was saved with surrounding quotes.',
      },
      { status: 401 },
    );
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

import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Reports what this deployment can actually do.
 *
 * This is the endpoint people hit precisely when the configuration is broken, so it
 * must never depend on that configuration being valid. Every lookup is guarded, and
 * a misconfigured environment is reported as JSON rather than as an opaque 500.
 */
export async function GET() {
  const problems: string[] = [];
  let storageDriver = 'unknown';
  let aiProvider = 'unknown';
  let envOk = false;

  try {
    const { env, hasVisionProvider } = await import('@/lib/env');
    storageDriver = env.STORAGE_DRIVER;
    aiProvider = hasVisionProvider() ? env.AI_PROVIDER : 'heuristic (no API key configured)';
    envOk = true;
  } catch (error) {
    problems.push(error instanceof Error ? error.message : 'Environment configuration is invalid');
  }

  let database: 'ok' | 'unreachable' | 'not_configured' = 'not_configured';
  let migrationsApplied: string[] = [];

  if (envOk) {
    try {
      const { db } = await import('@/lib/db/client');
      await db.execute(drizzleSql`SELECT 1`);
      database = 'ok';

      try {
        const rows = await db.execute<{ name: string }>(
          drizzleSql`SELECT name FROM public._pockit_migrations ORDER BY name`,
        );
        migrationsApplied = rows.map((r) => r.name);
        if (migrationsApplied.length === 0) {
          problems.push('No migrations have been applied. POST /api/admin/migrate with the x-admin-secret header.');
        }
      } catch {
        problems.push('The schema is not set up yet. POST /api/admin/migrate with the x-admin-secret header.');
      }
    } catch (error) {
      database = 'unreachable';
      problems.push(
        `Database unreachable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  const ready = envOk && database === 'ok' && migrationsApplied.length > 0;

  return NextResponse.json(
    {
      status: ready ? 'ready' : 'degraded',
      database,
      migrationsApplied,
      storageDriver,
      aiProvider,
      problems,
    },
    // 200 even when degraded: this endpoint succeeded in reporting the state, which
    // is what it is for. A platform health check should use `status` in the body.
    { status: 200 },
  );
}

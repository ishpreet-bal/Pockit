import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { env, hasVisionProvider } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Reports what the deployment can actually do, for debugging a bad environment. */
export async function GET() {
  let database: 'ok' | 'unreachable' = 'unreachable';
  let migrationsApplied: string[] = [];
  let detail: string | null = null;

  try {
    await db.execute(drizzleSql`SELECT 1`);
    database = 'ok';
    try {
      const rows = await db.execute<{ name: string }>(
        drizzleSql`SELECT name FROM public._pockit_migrations ORDER BY name`,
      );
      migrationsApplied = rows.map((r) => r.name);
    } catch {
      detail = 'Migrations have not been applied yet. POST /api/admin/migrate with the x-admin-secret header.';
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : 'Database unreachable';
  }

  return NextResponse.json({
    status: database === 'ok' && migrationsApplied.length > 0 ? 'ready' : 'degraded',
    database,
    migrationsApplied,
    storageDriver: env.STORAGE_DRIVER,
    aiProvider: hasVisionProvider() ? env.AI_PROVIDER : 'heuristic (no API key configured)',
    detail,
  });
}

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

/**
 * Migration runner, shared by `npm run db:migrate` and the guarded admin route.
 *
 * Deliberately NOT marked `server-only` and deliberately opening its own connection:
 * it has to run from a plain Node script as well as from a route handler, and
 * migrations should not depend on how the app pools connections for requests.
 */

/**
 * Is this chunk only comments and blank lines?
 *
 * Written as a line scan rather than a regex on purpose. The previous version used
 * `/^(--[^\n]*\n?)*$/`, whose nested quantifier backtracks catastrophically on a
 * chunk that begins with comment lines and then contains SQL — which is exactly how
 * the triggers-and-RLS migration starts. It did not fail; it hung forever, leaving a
 * database with tables but no row-level security.
 */
function isOnlyComments(chunk: string): boolean {
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (trimmed !== '' && !trimmed.startsWith('--')) return false;
  }
  return true;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  failed: { file: string; statement: string; error: string } | null;
}

export async function runMigrations(databaseUrl: string, dir?: string): Promise<MigrationResult> {
  const migrationsDir = dir ?? join(process.cwd(), 'drizzle');

  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes('sslmode=require') ? 'require' : undefined,
    max: 1,
    connect_timeout: 20,
    idle_timeout: 10,
    onnotice: () => {},
  });

  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS public._pockit_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const done = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM public._pockit_migrations`).map((r) => r.name),
    );

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (done.has(file)) {
        skipped.push(file);
        continue;
      }

      const raw = await readFile(join(migrationsDir, file), 'utf8');
      const chunks = raw
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !isOnlyComments(s));

      for (const chunk of chunks) {
        try {
          // `.simple()` is required, not optional. The extended protocol rejects
          // multi-statement chunks and cannot carry $$-quoted function bodies, which
          // is why the triggers-and-RLS migration silently hung instead of applying —
          // leaving a database with tables but no row-level security.
          await sql.unsafe(chunk).simple();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/already exists|duplicate (object|key|table)/i.test(message)) continue;
          return { applied, skipped, failed: { file, statement: chunk.slice(0, 600), error: message } };
        }
      }

      await sql`INSERT INTO public._pockit_migrations (name) VALUES (${file})`;
      applied.push(file);
    }

    return { applied, skipped, failed: null };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

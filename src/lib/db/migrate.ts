import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from './client';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  failed: { file: string; statement: string; error: string } | null;
}

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

/**
 * Applies the generated SQL files in order, once each, recording what ran.
 *
 * Migrations are applied deliberately (by `npm run db:migrate` or the guarded
 * admin route) and never automatically on boot: a schema change during a cold
 * start is how production outages happen.
 */
export async function runMigrations(): Promise<MigrationResult> {
  await db.execute(drizzleSql`
    CREATE TABLE IF NOT EXISTS public._pockit_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const existing = await db.execute<{ name: string }>(
    drizzleSql`SELECT name FROM public._pockit_migrations`,
  );
  const done = new Set(existing.map((r) => r.name));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file);
      continue;
    }
    const raw = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const statements = raw
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)*$/.test(s));

    for (const statement of statements) {
      try {
        await db.execute(drizzleSql.raw(statement));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Re-running a partially applied migration must not be fatal.
        if (/already exists|duplicate (object|key|table)/i.test(message)) continue;
        return {
          applied,
          skipped,
          failed: { file, statement: statement.slice(0, 500), error: message },
        };
      }
    }

    await db.execute(drizzleSql`INSERT INTO public._pockit_migrations (name) VALUES (${file})`);
    applied.push(file);
  }

  return { applied, skipped, failed: null };
}

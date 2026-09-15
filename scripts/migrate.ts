/**
 * Applies pending migrations. Run with: npm run db:migrate
 *
 * Deliberately self-contained: it opens its own connection rather than importing the
 * application's client, which is marked `server-only` and cannot be loaded outside a
 * React Server Component. Migrations are also conceptually separate from request
 * handling — they should not depend on how the app pools connections.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const sql = postgres(url, {
  ssl: url.includes('sslmode=require') ? 'require' : undefined,
  max: 1,
  connect_timeout: 20,
  onnotice: () => {},
});

const dir = join(process.cwd(), 'drizzle');

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

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;

    const raw = await readFile(join(dir, file), 'utf8');
    const statements = raw
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)*$/.test(s));

    process.stdout.write(`  ${file} … `);
    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Re-running a partially applied migration must not be fatal.
        if (/already exists|duplicate (object|key|table)/i.test(message)) continue;
        console.error(`\n✗ ${file} failed:\n  ${message}\n\n${statement.slice(0, 600)}\n`);
        await sql.end();
        process.exit(1);
      }
    }

    await sql`INSERT INTO public._pockit_migrations (name) VALUES (${file})`;
    applied.push(file);
    console.log('done');
  }

  console.log(
    applied.length > 0
      ? `✓ applied ${applied.length} migration(s)`
      : '✓ already up to date',
  );
} finally {
  await sql.end();
}

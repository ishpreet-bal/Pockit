/**
 * Applies pending migrations. Run with: npm run db:migrate
 * Requires DATABASE_URL and direct TCP access to the database.
 */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

const { runMigrations } = await import('../src/lib/db/migrate');
const { closeDb } = await import('../src/lib/db/client');

const result = await runMigrations();

if (result.failed) {
  console.error(`\n✗ ${result.failed.file} failed:\n  ${result.failed.error}\n`);
  console.error(`  Statement:\n${result.failed.statement}\n`);
  await closeDb();
  process.exit(1);
}

console.log(`✓ applied: ${result.applied.join(', ') || '(none)'}`);
if (result.skipped.length) console.log(`  already applied: ${result.skipped.join(', ')}`);
await closeDb();

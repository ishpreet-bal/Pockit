/**
 * Applies pending migrations. Run with: npm run db:migrate
 */
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const { runMigrations } = await import('../src/lib/db/migrate');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const result = await runMigrations(url);

if (result.failed) {
  console.error(`\n✗ ${result.failed.file} failed:\n  ${result.failed.error}\n`);
  console.error(result.failed.statement);
  process.exit(1);
}

console.log(result.applied.length > 0 ? `✓ applied: ${result.applied.join(', ')}` : '✓ already up to date');
if (result.skipped.length) console.log(`  already applied: ${result.skipped.join(', ')}`);

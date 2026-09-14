import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['pockit'],
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  verbose: true,
  strict: true,
} satisfies Config;

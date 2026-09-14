import 'server-only';
import postgres from 'postgres';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { env } from '@/lib/env';

/**
 * A single pooled connection, reused across hot reloads in development and across
 * warm serverless invocations in production.
 */
declare global {
  // eslint-disable-next-line no-var
  var __pockitSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  return postgres(env.DATABASE_URL, {
    ssl: env.DATABASE_URL.includes('sslmode=require') ? 'require' : undefined,
    // Serverless: keep the pool small, recycle idle connections quickly.
    max: env.NODE_ENV === 'production' ? 5 : 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    // bigint columns arrive as strings; lib/money owns the conversion.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: bigint | number | string) => v.toString(),
        parse: (v: string) => v,
      },
    },
    onnotice: () => {},
  });
}

export const sql = globalThis.__pockitSql ?? createClient();
if (env.NODE_ENV !== 'production') globalThis.__pockitSql = sql;

export const db = drizzle(sql, { schema, casing: 'snake_case' });
export type Db = typeof db;

/**
 * Run `fn` with the Postgres session bound to `userId`, so the RLS policies in
 * migration 0001 apply. Everything that touches tenant data goes through here.
 *
 * `SET LOCAL` is transaction-scoped, so the binding cannot leak to the next
 * checkout of a pooled connection.
 */
export async function withUser<T>(userId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // Parameterised: the uuid is validated and bound, never interpolated.
    await tx.execute(drizzleSql`SELECT set_config('pockit.user_id', ${assertUuid(userId)}, true)`);
    return fn(tx as unknown as Db);
  });
}

/**
 * For the few operations that legitimately run without a user context:
 * sign-up (before the user row exists), sign-in, and cron bookkeeping.
 * These only ever touch tables that carry no workspace_id.
 */
export async function withoutUser<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx as unknown as Db));
}

function assertUuid(v: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new Error('Invalid user id');
  }
  return v;
}

// Re-exported so callers do not import drizzle's `sql` under a confusing name.
export { sql as rawSql };

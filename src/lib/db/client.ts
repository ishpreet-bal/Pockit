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

/**
 * The connection is created on FIRST USE, not on import.
 *
 * `next build` imports every route module to collect page data. If the client
 * connected at module scope, the build would require DATABASE_URL and AUTH_SECRET —
 * values that are only needed to serve a request. That made the production build
 * fail on a correctly-configured deployment.
 */
function getSql(): ReturnType<typeof postgres> {
  if (globalThis.__pockitSql) return globalThis.__pockitSql;
  const client = createClient();
  // Reused across hot reloads in development and warm invocations in production.
  globalThis.__pockitSql = client;
  return client;
}

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: DrizzleDb | undefined;

function getDb(): DrizzleDb {
  cachedDb ??= drizzle(getSql(), { schema, casing: 'snake_case' });
  return cachedDb;
}

export type Db = DrizzleDb;

/** Lazily-resolved handle. Touching a property is what opens the connection. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

/** Closes the pool. Used by the migration script so the process can exit. */
export async function closeDb(): Promise<void> {
  if (globalThis.__pockitSql) {
    await globalThis.__pockitSql.end({ timeout: 5 });
    globalThis.__pockitSql = undefined;
    cachedDb = undefined;
  }
}

/**
 * Run `fn` with the Postgres session bound to `userId`, so the RLS policies in
 * migration 0001 apply. Everything that touches tenant data goes through here.
 *
 * `SET LOCAL` is transaction-scoped, so the binding cannot leak to the next
 * checkout of a pooled connection.
 */
export async function withUser<T>(userId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  const enforce = await canEnforceRls();
  return db.transaction(async (tx) => {
    // Parameterised: the uuid is validated and bound, never interpolated.
    await tx.execute(drizzleSql`SELECT set_config('pockit.user_id', ${assertUuid(userId)}, true)`);
    // Drop to the role that cannot bypass row-level security (migration 0012), so
    // the policies hold even where application code forgets a workspace filter.
    if (enforce) await tx.execute(drizzleSql`SET LOCAL ROLE pockit_app`);
    return fn(tx as unknown as Db);
  });
}

let rlsRole: Promise<boolean> | undefined;

/**
 * Whether `pockit_app` exists and this connection may switch to it. Checked once
 * per process. Before migration 0012 has run it does not exist, and requests carry
 * on as before rather than failing, so deploying the code ahead of the migration
 * is safe. /api/health reports which mode is in effect.
 */
export function canEnforceRls(): Promise<boolean> {
  rlsRole ??= (async () => {
    try {
      // CASE, not AND: pg_has_role throws on a role that does not exist yet.
      const rows = await db.execute(drizzleSql`SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pockit_app')
        THEN pg_has_role(current_user, 'pockit_app', 'MEMBER') ELSE false END AS ok`);
      const first = (rows as unknown as { ok: boolean }[])[0];
      return Boolean(first?.ok);
    } catch {
      rlsRole = undefined; // try again on the next request
      return false;
    }
  })();
  return rlsRole;
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

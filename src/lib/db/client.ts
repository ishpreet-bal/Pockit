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
  const role = await rlsRole();
  return db.transaction(async (tx) => {
    // Parameterised: the uuid is validated and bound, never interpolated.
    await tx.execute(drizzleSql`SELECT set_config('pockit.user_id', ${assertUuid(userId)}, true)`);
    // Drop to a role that cannot bypass row-level security, so the policies hold
    // even where application code forgets a workspace filter. The name comes from a
    // fixed list (never from input), which is why it can be written into the SQL.
    if (role) await tx.execute(drizzleSql.raw(`SET LOCAL ROLE ${role}`));
    return fn(tx as unknown as Db);
  });
}

/** Roles that can enforce row-level security, best first. */
const RLS_ROLES = ['pockit_app', 'authenticated'] as const;
type RlsRole = (typeof RLS_ROLES)[number];
let chosenRole: Promise<RlsRole | null> | undefined;

/**
 * The role requests run as, so the database itself keeps each person's data apart.
 *
 *  - `pockit_app` (migration 0012), where the database let us create it.
 *  - `authenticated`, Supabase's built-in role, where creating roles is refused
 *    ("restricted superuser"). Migration 0016 grants it the same access.
 *
 * Only a role that exists, cannot bypass row-level security, that this connection
 * may switch to, and that already has its grants is used: anything less would turn
 * every request into a permission error. Checked once per process; null means the
 * policies are not enforced by the database and /api/health says so.
 */
function rlsRole(): Promise<RlsRole | null> {
  chosenRole ??= (async () => {
    try {
      const rows = await db.execute(drizzleSql`
        SELECT r.rolname AS role FROM pg_roles r
        WHERE r.rolname IN ('pockit_app', 'authenticated') AND NOT r.rolbypassrls AND NOT r.rolsuper
        ORDER BY r.rolname = 'pockit_app' DESC`);
      for (const { role } of rows as unknown as { role: string }[]) {
        if ((RLS_ROLES as readonly string[]).includes(role) && (await canUse(role as RlsRole))) return role as RlsRole;
      }
      return null;
    } catch {
      chosenRole = undefined; // try again on the next request
      return null;
    }
  })();
  return chosenRole;
}

/**
 * Can this connection actually switch to the role and read a table as it? Tried for
 * real in a transaction that is always rolled back: being a "member" isn't enough on
 * newer Postgres (membership can be granted without the right to SET ROLE).
 */
const ROLLBACK = Symbol('rollback');
async function canUse(role: RlsRole): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(drizzleSql.raw(`SET LOCAL ROLE ${role}`));
      await tx.execute(drizzleSql`SELECT 1 FROM pockit.transactions LIMIT 1`);
      await tx.execute(drizzleSql`SELECT 1 FROM pockit.users LIMIT 1`);
      throw ROLLBACK;
    });
    return false;
  } catch (e) {
    return e === ROLLBACK;
  }
}

/** Whether requests run under a role the database holds to row-level security. */
export async function canEnforceRls(): Promise<boolean> {
  return (await rlsRole()) !== null;
}

/** Which role enforces row-level security, for /api/health. */
export const rlsEnforcedBy = rlsRole;

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

/**
 * Why row-level security is or isn't enforced, for /api/health: each condition the
 * role needs, checked separately. Names of roles and true/false only.
 */
export async function rlsDiagnosis(): Promise<Record<string, unknown>> {
  try {
    const rows = await db.execute(drizzleSql`
      SELECT current_user AS connected_as,
        r.rolname AS role,
        r.rolbypassrls AS bypasses_rls,
        pg_has_role(current_user, r.oid, 'MEMBER') AS can_switch,
        has_schema_privilege(r.oid, 'pockit', 'USAGE') AS schema_access,
        has_table_privilege(r.oid, 'pockit.transactions', 'SELECT, INSERT, UPDATE, DELETE') AS table_access
      FROM pg_roles r WHERE r.rolname IN ('pockit_app', 'authenticated')`);
    const list = rows as unknown as Record<string, unknown>[];
    for (const r of list) r.can_set_role_and_read = await canUse(r.role as RlsRole);
    return { candidates: list, connectedAs: list[0]?.connected_as ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : 'unknown' };
  }
}

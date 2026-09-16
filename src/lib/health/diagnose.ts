/**
 * One shared answer to "is this deployment actually usable?".
 *
 * Both `/api/health` (for me and for platform checks) and `/setup` (for the person
 * looking at a broken page) need the same diagnosis, and they must never disagree.
 * Nothing in here may assume the environment is valid — this code runs precisely
 * when it is not, so every lookup is guarded and returns a finding instead of throwing.
 */

export type DatabaseState = 'ok' | 'unreachable' | 'not_configured';

export interface Finding {
  /** What is wrong, in words someone who did not write this app can act on. */
  problem: string;
  /** The single next thing to do about it. */
  fix: string;
}

export interface Diagnosis {
  status: 'ready' | 'degraded';
  database: DatabaseState;
  migrationsApplied: string[];
  storageDriver: string;
  aiProvider: string;
  /** Kept as plain strings for backwards compatibility with the JSON health shape. */
  problems: string[];
  findings: Finding[];
  /** True when the only thing standing between here and a working app is running migrations. */
  needsMigration: boolean;
}

export async function diagnose(): Promise<Diagnosis> {
  const findings: Finding[] = [];
  let storageDriver = 'unknown';
  let aiProvider = 'unknown';
  let envOk = false;

  try {
    const { env, hasVisionProvider } = await import('@/lib/env');
    storageDriver = env.STORAGE_DRIVER;
    aiProvider = hasVisionProvider() ? env.AI_PROVIDER : 'heuristic (no API key configured)';
    envOk = true;
  } catch (error) {
    findings.push({
      problem: error instanceof Error ? error.message : 'Environment configuration is invalid',
      fix: 'Add the missing values under Settings → Environment Variables in your hosting dashboard, then redeploy.',
    });
  }

  let database: DatabaseState = 'not_configured';
  let migrationsApplied: string[] = [];
  let needsMigration = false;

  if (envOk) {
    try {
      const [{ db }, { sql }] = await Promise.all([
        import('@/lib/db/client'),
        import('drizzle-orm'),
      ]);
      await db.execute(sql`SELECT 1`);
      database = 'ok';

      try {
        const rows = await db.execute<{ name: string }>(
          sql`SELECT name FROM public._pockit_migrations ORDER BY name`,
        );
        migrationsApplied = rows.map((r) => r.name);
        if (migrationsApplied.length === 0) {
          needsMigration = true;
          findings.push({
            problem: 'The database is reachable but completely empty — no tables have been created yet.',
            fix: 'Run the one-time setup below. Nothing can be saved or read until it finishes.',
          });
        }
      } catch {
        needsMigration = true;
        findings.push({
          problem: 'The database is reachable but the tables Pockit needs do not exist yet.',
          fix: 'Run the one-time setup below. Nothing can be saved or read until it finishes.',
        });
      }
    } catch (error) {
      database = 'unreachable';
      findings.push({
        problem: `Could not connect to the database: ${error instanceof Error ? error.message : 'unknown error'}`,
        fix: 'Check that DATABASE_URL is correct and that the database is running, then redeploy.',
      });
    }
  }

  const ready = envOk && database === 'ok' && migrationsApplied.length > 0;

  return {
    status: ready ? 'ready' : 'degraded',
    database,
    migrationsApplied,
    storageDriver,
    aiProvider,
    problems: findings.map((f) => `${f.problem} ${f.fix}`),
    findings,
    needsMigration,
  };
}

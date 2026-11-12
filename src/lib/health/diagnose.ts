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
  /** Whether this deployment has an ADMIN_SECRET at all — without one, setup cannot run. */
  adminSecretConfigured: boolean;
  /** Migrations this build ships that the database has not applied yet. */
  pendingMigrations: string[];
  /** True when the only thing standing between here and a working app is running migrations. */
  needsMigration: boolean;
  /** Bank connection: off (no Plaid keys), or which Plaid environment the keys are for. Never the keys. */
  bankConnection: 'off' | 'sandbox' | 'production';
  /** Whether CRON_SECRET is set, so the daily bank sync and guest cleanup can run. */
  dailyJobsConfigured: boolean;
  /** Who keeps one person's records from another's: the database (and under which role), or only the app's own filters. */
  rowLevelSecurity: string;
  /** When it isn't the database: which condition is missing. */
  rowLevelSecurityDetail?: Record<string, unknown>;
  /** Optional features and whether this deployment has what each needs. Never any key itself. */
  features: Record<string, boolean | string>;
  /** In plain words, what is switched off and the key that turns it on. */
  missing: string[];
}

export async function diagnose(): Promise<Diagnosis> {
  const findings: Finding[] = [];
  let storageDriver = 'unknown';
  let aiProvider = 'unknown';
  let adminSecretConfigured = false;
  let envOk = false;
  const plaidKeys = Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim());
  // Read the same forgiving way as src/lib/bank/plaid.ts: "Production" counts, anything unknown is sandbox.
  const plaidEnvRaw = process.env.PLAID_ENV?.trim().toLowerCase() ?? '';
  const bankConnection: Diagnosis['bankConnection'] = !plaidKeys ? 'off' : plaidEnvRaw === 'production' ? 'production' : 'sandbox';
  const dailyJobsConfigured = Boolean(process.env.CRON_SECRET?.trim());
  const has = (k: string) => Boolean(process.env[k]?.trim());
  const features: Diagnosis['features'] = {
    aiAnswers: has('ANTHROPIC_API_KEY') || has('OPENAI_API_KEY'),
    emails: has('RESEND_API_KEY') && has('EMAIL_FROM'),
    supportEmail: has('SUPPORT_EMAIL'),
    maps: has('GOOGLE_MAPS_API_KEY') ? 'google' : 'openstreetmap (free, no uptime promise)',
    livePrices: has('TWELVEDATA_API_KEY') || has('FINNHUB_API_KEY'),
    bankTokenKey: has('BANK_TOKEN_KEY'),
  };
  const missing = [
    !features.aiAnswers && 'Ask Pock and receipt scanning: add ANTHROPIC_API_KEY (or OPENAI_API_KEY with AI_PROVIDER=openai).',
    !features.emails && 'Password-reset and feedback emails: add RESEND_API_KEY and EMAIL_FROM.',
    !features.supportEmail && 'Where feedback goes, and the contact on /privacy: add SUPPORT_EMAIL.',
    !has('GOOGLE_MAPS_API_KEY') && 'Reliable trip search and routes: add GOOGLE_MAPS_API_KEY (Places API (New) and Routes API).',
    !features.livePrices && 'Live stock prices: add TWELVEDATA_API_KEY.',
    !dailyJobsConfigured && 'Daily bank sync and guest cleanup: add CRON_SECRET.',
    plaidKeys && plaidEnvRaw && plaidEnvRaw !== 'production' && plaidEnvRaw !== 'sandbox' && `PLAID_ENV is "${process.env.PLAID_ENV?.trim()}", which Plaid doesn't have: set it to production (Trial and paid plans) or sandbox. Using sandbox until then.`,
    bankConnection !== 'off' && !features.bankTokenKey && 'Bank logins encrypted with their own key: add BANK_TOKEN_KEY before real banks are connected.',
  ].filter((x): x is string => Boolean(x));

  try {
    const { env, hasVisionProvider } = await import('@/lib/env');
    storageDriver = env.STORAGE_DRIVER;
    aiProvider = hasVisionProvider() ? env.AI_PROVIDER : 'heuristic (no API key configured)';
    adminSecretConfigured = (env.ADMIN_SECRET ?? '').trim() !== '';
    envOk = true;
  } catch (error) {
    findings.push({
      problem: error instanceof Error ? error.message : 'Environment configuration is invalid',
      fix: 'Add the missing values under Settings → Environment Variables in your hosting dashboard, then redeploy.',
    });
  }

  let database: DatabaseState = 'not_configured';
  let migrationsApplied: string[] = [];
  let pendingMigrations: string[] = [];
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
      } catch {
        migrationsApplied = [];
      }

      // Comparing against the migrations this build ships is the whole point. An
      // earlier version only asked whether ANY migration had run, so a database
      // migrated before a later release was reported as ready while every page that
      // touched a new column threw. A partially migrated database is a broken one.
      try {
        const { expectedMigrations } = await import('@/lib/db/migrate');
        const expected = await expectedMigrations();
        const done = new Set(migrationsApplied);
        pendingMigrations = expected.filter((name) => !done.has(name));
      } catch (error) {
        findings.push({
          problem: `Could not read this build's migration files: ${error instanceof Error ? error.message : 'unknown error'}`,
          fix: 'This is a packaging problem in the deployment, not something you can fix from here.',
        });
      }

      if (migrationsApplied.length === 0) {
        needsMigration = true;
        findings.push({
          problem: 'The database is reachable but the tables Pockit needs do not exist yet.',
          fix: 'Run the one-time setup below. Nothing can be saved or read until it finishes.',
        });
      } else if (pendingMigrations.length > 0) {
        needsMigration = true;
        findings.push({
          problem:
            `The database was set up for an older version of Pockit. ` +
            `${pendingMigrations.length === 1 ? '1 update has' : `${pendingMigrations.length} updates have`} ` +
            `not been applied yet (${pendingMigrations.join(', ')}), so pages that use the newer ` +
            'features fail to load.',
          fix: 'Run the update below. It only applies what is missing and leaves your existing data alone.',
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

  let rowLevelSecurity = 'unknown';
  let rowLevelSecurityDetail: Record<string, unknown> | undefined;
  if (database === 'ok') {
    try {
      const { rlsEnforcedBy, rlsDiagnosis } = await import('@/lib/db/client');
      const role = await rlsEnforcedBy();
      rowLevelSecurity = role ? `enforced by the database (${role})` : 'app filters only';
      if (!role) rowLevelSecurityDetail = await rlsDiagnosis();
    } catch { /* reported as unknown */ }
  }

  const ready = envOk && database === 'ok' && migrationsApplied.length > 0 && pendingMigrations.length === 0;

  return {
    status: ready ? 'ready' : 'degraded',
    database,
    migrationsApplied,
    adminSecretConfigured,
    pendingMigrations,
    storageDriver,
    aiProvider,
    problems: findings.map((f) => `${f.problem} ${f.fix}`),
    findings,
    needsMigration,
    bankConnection,
    dailyJobsConfigured,
    rowLevelSecurity,
    ...(rowLevelSecurityDetail ? { rowLevelSecurityDetail } : {}),
    features,
    missing,
  };
}

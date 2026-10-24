import { z } from 'zod';

/**
 * Environment validation. The app refuses to start with a broken configuration
 * rather than failing later with a confusing runtime error.
 */
/**
 * Vercel passes a declared-but-blank environment variable as an empty string, and
 * `z.enum().default()` only fills `undefined` — so a blank AI_PROVIDER failed
 * validation instead of falling back. Blank means "not set" for every field.
 */
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema);

const serverSchema = z.object({
  NODE_ENV: blankToUndefined(z.enum(['development', 'test', 'production']).default('development')),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Signs session cookies. Must be at least 32 chars and must differ per environment. */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  APP_URL: blankToUndefined(z.string().url().default('http://localhost:3000')),

  /** Optional: enables vision extraction. Without it the heuristic provider is used. */
  ANTHROPIC_API_KEY: blankToUndefined(z.string().optional()),
  OPENAI_API_KEY: blankToUndefined(z.string().optional()),
  AI_PROVIDER: blankToUndefined(z.enum(['anthropic', 'openai', 'heuristic', 'auto']).default('auto')),
  /** The Claude model. OpenAI has its own, so switching provider needs no other change. */
  AI_MODEL: blankToUndefined(z.string().optional()),
  OPENAI_MODEL: blankToUndefined(z.string().optional()),

  STORAGE_DRIVER: blankToUndefined(z.enum(['postgres', 'supabase', 'vercel_blob']).default('postgres')),
  SUPABASE_URL: blankToUndefined(z.string().optional()),
  SUPABASE_SERVICE_ROLE_KEY: blankToUndefined(z.string().optional()),
  SUPABASE_BUCKET: blankToUndefined(z.string().default('pockit-files')),
  BLOB_READ_WRITE_TOKEN: blankToUndefined(z.string().optional()),

  /** Guards /api/cron/* and /api/admin/*. */
  ADMIN_SECRET: blankToUndefined(z.string().optional()),
  CRON_SECRET: blankToUndefined(z.string().optional()),

  /**
   * Turns Pockit Plus on. Off by default: until it's switched on, every account
   * gets everything (unlimited Pock included) and the app shows no paywall. The
   * plan columns and the webhook still work, so the switch can be flipped any time.
   */
  PLUS_ENABLED: blankToUndefined(z.enum(['true', 'false']).default('false')).transform((v) => v === 'true'),

  /**
   * Comma-separated emails of the people who run Pockit. Admins always have Plus
   * (never a paywall or limit) and see the app's Developer screen.
   */
  ADMIN_EMAILS: blankToUndefined(z.string().optional()),

  /** Shared secret RevenueCat sends with every webhook, so nobody else can grant Plus. */
  REVENUECAT_WEBHOOK_SECRET: blankToUndefined(z.string().optional()),

  /** Where people write to about their data and account. Shown on /privacy and /terms. */
  SUPPORT_EMAIL: blankToUndefined(z.string().email().optional()),

  /** Hard cap on upload size, in megabytes. */
  MAX_UPLOAD_MB: blankToUndefined(z.coerce.number().int().positive().default(8)),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * `next build` imports every route module to collect page data, without the runtime
 * environment being present. Secrets are therefore only *required* when something
 * actually reads them to serve a request — the lazy Proxy below is what defers that.
 *
 * During a build, a missing secret yields a placeholder rather than a hard failure,
 * so the build succeeds and the deployment reports the real problem through
 * /api/health instead of failing opaquely at build time.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

/**
 * Says whether a failing variable is absent or merely blank.
 *
 * These are the same failure to a schema and completely different failures to a
 * person: "DATABASE_URL is required" sent someone hunting for a variable they could
 * see listed in their dashboard, because the value behind it had been saved empty.
 * Only the length is ever reported — never any part of the value.
 */
function describeValue(key: string): string {
  if (!(key in process.env)) return ' (this variable is not set on this deployment at all)';
  const raw = process.env[key] ?? '';
  if (raw.trim() === '') {
    return ' (the variable EXISTS on this deployment but its value is empty — re-enter it, then redeploy)';
  }
  return ` (the variable is set, and ${raw.trim().length} characters long, but is not valid)`;
}

function load(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  if (isBuildPhase()) {
    // Parse again with the required secrets stubbed, so the build can complete.
    const relaxed = serverSchema.safeParse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://build-placeholder/none',
      AUTH_SECRET: process.env.AUTH_SECRET || 'build-placeholder-secret-not-used-at-runtime',
    });
    if (relaxed.success) return relaxed.data;
  }

  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}${describeValue(String(i.path[0] ?? ''))}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\n` +
    `DATABASE_URL and AUTH_SECRET are required to serve requests. ` +
    `See .env.example. Generate a secret with: openssl rand -base64 48`,
  );
}

let cached: ServerEnv | undefined;

export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_t, prop: string) {
    cached ??= load();
    return cached[prop as keyof ServerEnv];
  },
});

/** True when a vision-capable AI provider is configured. */
export function hasVisionProvider(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
}

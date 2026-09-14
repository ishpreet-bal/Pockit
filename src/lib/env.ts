import { z } from 'zod';

/**
 * Environment validation. The app refuses to start with a broken configuration
 * rather than failing later with a confusing runtime error.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Signs session cookies. Must be at least 32 chars and must differ per environment. */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  /** Optional: enables vision extraction. Without it the heuristic provider is used. */
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'heuristic', 'auto']).default('auto'),
  AI_MODEL: z.string().optional(),

  STORAGE_DRIVER: z.enum(['postgres', 'supabase', 'vercel_blob']).default('postgres'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default('pockit-files'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  /** Guards /api/cron/* and /api/admin/*. */
  ADMIN_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  /** Hard cap on upload size, in megabytes. */
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(8),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function load(): ServerEnv {
  // During `next build` the DB is not contacted, but the schema still has to pass.
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
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

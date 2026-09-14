import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Regression tests for the Vercel build failure.
 *
 * `next build` imports every route module to collect page data, without the runtime
 * environment present. Two separate bugs made that fail:
 *   1. the database client connected at module scope, forcing env validation
 *   2. Vercel passes a declared-but-blank variable as "", and z.enum().default()
 *      only fills `undefined` — so a blank AI_PROVIDER failed instead of defaulting
 */
const ORIGINAL = { ...process.env };

async function loadEnv() {
  // The env module caches its parse, so the registry is reset for each case.
  vi.resetModules();
  return import('./env');
}

beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL);
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('environment validation', () => {
  it('treats a blank variable as unset so defaults apply', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    process.env.AUTH_SECRET = 'x'.repeat(40);
    // Exactly what Vercel supplies for a declared-but-empty variable.
    process.env.AI_PROVIDER = '';
    process.env.STORAGE_DRIVER = '';
    process.env.MAX_UPLOAD_MB = '';
    process.env.APP_URL = '';

    const { env } = await loadEnv();
    expect(env.AI_PROVIDER).toBe('auto');
    expect(env.STORAGE_DRIVER).toBe('postgres');
    expect(env.MAX_UPLOAD_MB).toBe(8);
    expect(env.APP_URL).toBe('http://localhost:3000');
  });

  it('allows a production build to complete without runtime secrets', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    process.env.NEXT_PHASE = 'phase-production-build';

    const { env } = await loadEnv();
    // Placeholders let the build finish; they are never used to serve a request.
    expect(env.DATABASE_URL).toContain('build-placeholder');
    expect(env.STORAGE_DRIVER).toBe('postgres');
  });

  it('refuses to serve requests without the required secrets', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXT_PHASE;

    const { env } = await loadEnv();
    // The Proxy defers validation to first access, which is what keeps the build
    // working — but a real request must still fail loudly rather than silently
    // running against a placeholder.
    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL/);
  });

  it('rejects a short AUTH_SECRET', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    process.env.AUTH_SECRET = 'too-short';
    delete process.env.NEXT_PHASE;

    const { env } = await loadEnv();
    expect(() => env.AUTH_SECRET).toThrow(/at least 32 characters/);
  });
});

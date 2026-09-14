import 'server-only';
import { sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

/**
 * Fixed-window rate limiting in Postgres.
 *
 * A database table rather than an in-memory map because serverless functions do not
 * share memory: an in-memory limiter on Vercel limits nothing. Redis would be better
 * under real load, but this is correct and needs no extra service.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const rows = await db.execute<{ count: number }>(dsql`
      INSERT INTO pockit.rate_limits (key, count, window_start)
      VALUES (${key}, 1, now())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN pockit.rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1
          ELSE pockit.rate_limits.count + 1
        END,
        window_start = CASE
          WHEN pockit.rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now()
          ELSE pockit.rate_limits.window_start
        END
      RETURNING count
    `);
    const count = Number(rows[0]?.count ?? 1);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    // Fail open: a limiter outage must not lock everyone out of their own finances.
    return { allowed: true, remaining: limit };
  }
}

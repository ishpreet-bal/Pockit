import { NextResponse } from 'next/server';
import { diagnose } from '@/lib/health/diagnose';

export const dynamic = 'force-dynamic';

/**
 * Reports what this deployment can actually do.
 *
 * This is the endpoint people hit precisely when the configuration is broken, so it
 * must never depend on that configuration being valid. The diagnosis itself lives in
 * `@/lib/health/diagnose` so that this route and the human-readable `/setup` page can
 * never disagree about whether the app is usable.
 */
export async function GET() {
  const { findings: _findings, ...json } = await diagnose();
  // 200 even when degraded: this endpoint succeeded in reporting the state, which
  // is what it is for. A platform health check should use `status` in the body.
  return NextResponse.json(json, { status: 200 });
}

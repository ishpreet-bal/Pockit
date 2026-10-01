import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withoutUser } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { getPlan } from '@/lib/billing/plan';

export const dynamic = 'force-dynamic';

/** Who is signed in, and whether setup is finished — what the app needs on launch. */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const plan = await getPlan(ctx.user);
  const rows = await withoutUser((tx) =>
    tx.select({ stage: userProfiles.onboardingStage, tour: userProfiles.tourCompletedAt }).from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1),
  );
  return NextResponse.json({
    name: ctx.user.displayName,
    email: ctx.user.email,
    setupDone: rows[0]?.stage === 'done' || Boolean(ctx.user.onboardingCompletedAt),
    id: ctx.user.id,
    tourDone: Boolean(rows[0]?.tour),
    admin: plan.admin,
    plusEnabled: plan.enabled,
    plus: plan.plus,
    plusUntil: plan.plusUntil,
    pockLeftThisMonth: plan.pockLeftThisMonth,
  });
}

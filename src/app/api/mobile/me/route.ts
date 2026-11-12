import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withoutUser } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { getPlan } from '@/lib/billing/plan';
import { aiCompany, hasAiConsent } from '@/lib/ai/consent';
import { hasSampleData } from '@/lib/data/clear-sample';

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
    // A guest's address is a placeholder; never show it.
    email: ctx.user.isGuest ? null : ctx.user.email,
    guest: ctx.user.isGuest,
    /** Who Pock's answers come from, and whether this person has allowed it. */
    aiProvider: aiCompany(),
    aiConsent: await hasAiConsent(ctx.user.id),
    setupDone: rows[0]?.stage === 'done' || Boolean(ctx.user.onboardingCompletedAt),
    id: ctx.user.id,
    tourDone: Boolean(rows[0]?.tour),
    admin: plan.admin,
    plusEnabled: plan.enabled,
    plus: plan.plus,
    plusUntil: plan.plusUntil,
    pockLeftThisMonth: plan.pockLeftThisMonth,
    /** A real account with sample money in it: the app offers to take it out. */
    sampleData: !ctx.user.isGuest && (await hasSampleData(ctx.user.id, ctx.workspace.id)),
  });
}

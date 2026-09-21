import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { investorProfiles } from '@/lib/db/schema';
import { buildInvestorProfile, type InvestorAnswers } from '@/lib/finance/investing';
import { audit } from '@/lib/auth/session';

const schema = z.object({
  experience: z.enum(['none', 'some', 'confident']),
  horizon: z.enum(['under1', 'one_to_three', 'three_to_ten', 'over_ten']),
  reaction: z.enum(['sell', 'wait', 'buy']),
  hasBuffer: z.boolean(),
  hasHighInterestDebt: z.boolean(),
  /** Must be explicitly true. Consent is never inferred from having submitted. */
  acceptedDisclaimer: z.literal(true),
});

/**
 * Saves the answers and the profile derived from them.
 *
 * The profile is computed on the SERVER from the raw answers rather than trusted
 * from the client. A risk level is not a preference the browser gets to assert —
 * it is a conclusion drawn from what was answered, and the answers are what is
 * stored so it can always be re-derived.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Answer every question and accept the disclaimers to continue.' },
      { status: 400 },
    );
  }

  const answers: InvestorAnswers = {
    experience: parsed.data.experience,
    horizon: parsed.data.horizon,
    reaction: parsed.data.reaction,
    hasBuffer: parsed.data.hasBuffer,
    hasHighInterestDebt: parsed.data.hasHighInterestDebt,
  };
  const profile = buildInvestorProfile(answers);

  await withUser(ctx.user.id, async (tx) => {
    await tx.insert(investorProfiles).values({
      workspaceId: ctx.workspace.id,
      answers,
      level: profile.level,
      stocksPct: profile.allocation?.stocksPct ?? null,
      bondsPct: profile.allocation?.bondsPct ?? null,
      cashPct: profile.allocation?.cashPct ?? null,
      disclaimerAcceptedAt: new Date(),
    }).onConflictDoUpdate({
      target: investorProfiles.workspaceId,
      set: {
        answers,
        level: profile.level,
        stocksPct: profile.allocation?.stocksPct ?? null,
        bondsPct: profile.allocation?.bondsPct ?? null,
        cashPct: profile.allocation?.cashPct ?? null,
        disclaimerAcceptedAt: new Date(),
        updatedAt: sql`now()`,
      },
    });
  });

  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'investing.profile_saved', entity: 'workspace', entityId: ctx.workspace.id,
  });

  return NextResponse.json({ ok: true, profile });
}

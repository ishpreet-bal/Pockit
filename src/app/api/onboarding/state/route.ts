import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withoutUser } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { answersSchema, parseAnswers, STAGES } from '@/lib/onboarding/state';

export const dynamic = 'force-dynamic';

/** Where they are, and what they have told us. Called on resume. */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const rows = await withoutUser((tx) =>
    tx.select({
      stage: userProfiles.onboardingStage,
      answers: userProfiles.onboardingAnswers,
      tourCompletedAt: userProfiles.tourCompletedAt,
    }).from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1),
  );

  const row = rows[0];
  return NextResponse.json({
    stage: row?.stage ?? 'not_started',
    answers: parseAnswers(row?.answers),
    tourCompleted: Boolean(row?.tourCompletedAt),
  });
}

const patchSchema = z.object({
  stage: z.enum(STAGES).optional(),
  /** Merged into what is stored, so one screen never erases another's answers. */
  answers: answersSchema.optional(),
  tourCompleted: z.boolean().optional(),
});

/**
 * Save progress.
 *
 * Called after EVERY screen, not at the end. That is what makes closing the browser
 * halfway through survivable, and it is why answers are merged rather than
 * replaced — screen four posting its own answer must not wipe screens one to three.
 */
export async function PATCH(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'That could not be saved.' }, { status: 400 });
  }

  const saved = await withoutUser(async (tx) => {
    const rows = await tx.select({
      stage: userProfiles.onboardingStage,
      answers: userProfiles.onboardingAnswers,
    }).from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1);

    const existing = parseAnswers(rows[0]?.answers);
    const merged = { ...existing, ...(parsed.data.answers ?? {}) };

    await tx.update(userProfiles).set({
      ...(parsed.data.stage ? { onboardingStage: parsed.data.stage } : {}),
      ...(parsed.data.answers ? { onboardingAnswers: merged } : {}),
      ...(parsed.data.tourCompleted ? { tourCompletedAt: new Date() } : {}),
      // The legacy completion timestamp is kept in step with the stage, so any code
      // still reading it — the app shell's redirect, among others — agrees.
      ...(parsed.data.stage === 'done' ? { onboardingCompletedAt: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(userProfiles.userId, ctx.user.id));

    return merged;
  });

  return NextResponse.json({ ok: true, answers: saved });
}

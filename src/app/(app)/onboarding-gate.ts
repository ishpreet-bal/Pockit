import 'server-only';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { isComplete } from '@/lib/onboarding/state';

/**
 * Keep a brand-new account out of the dashboard until setup has run.
 *
 * The brief's first requirement: someone who has never used Pockit should not meet
 * Overview, Investments, Transactions and a full navigation on their first second.
 *
 * Only accounts created after the stage machine shipped can fail this check — the
 * migration marked every pre-existing profile 'done' precisely so that an existing
 * user is never pulled backwards through a flow they have no need for.
 */
export async function requireOnboarded(userId: string): Promise<void> {
  const rows = await withoutUser((tx) =>
    tx.select({ stage: userProfiles.onboardingStage })
      .from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
  );
  const stage = rows[0]?.stage ?? 'done';
  if (!isComplete(stage)) redirect('/onboarding');
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/guard';
import { getUserWorkspaces } from '@/lib/auth/session';
import { withoutUser } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { parseAnswers } from '@/lib/onboarding/state';
import { OnboardingFlow } from './flow';
import { Ambient } from '@/components/brand/ambient';

export const metadata: Metadata = { title: 'Get started' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await requireUser();
  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect('/sign-up');

  // Resume state comes from the SERVER, not from anything the browser kept. That is
  // the whole point: a tab closed at question four has no local state left.
  const rows = await withoutUser((tx) =>
    tx.select({ stage: userProfiles.onboardingStage, answers: userProfiles.onboardingAnswers })
      .from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1),
  );

  // Somebody who already finished should never be pulled back through setup.
  if (rows[0]?.stage === 'done') redirect('/overview');

  return (
    <div className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4 py-10">
      <Ambient />
      <div className="relative w-full max-w-lg">
      <OnboardingFlow
        displayName={user.displayName}
        baseCurrency={user.baseCurrency}
        initialStage={rows[0]?.stage ?? 'account_created'}
        initialAnswers={parseAnswers(rows[0]?.answers)}
      />
      </div>
    </div>
  );
}

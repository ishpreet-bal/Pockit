import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { investorProfiles } from '@/lib/db/schema';
import { buildInvestorProfile, type InvestorAnswers } from '@/lib/finance/investing';
import { InvestingClient } from './profile-client';
import { sourceInfo } from '../data';

export const metadata: Metadata = { title: 'Your investor profile' };
export const dynamic = 'force-dynamic';

/**
 * The risk questionnaire, on its own route.
 *
 * It used to sit on top of the investing home, where it was the first thing between
 * you and anything you came to look at. It is a once-in-a-while task, so it lives
 * somewhere you go on purpose.
 *
 * The profile is re-derived from the stored answers on every load, so a change to
 * the model updates an existing profile rather than leaving a stale conclusion.
 */
export default async function InvestorProfilePage() {
  const { user, workspace } = await requireAuth();

  const [row] = await withUser(user.id, (tx) =>
    tx.select().from(investorProfiles).where(eq(investorProfiles.workspaceId, workspace.id)).limit(1),
  );

  const answers = (row?.answers ?? null) as InvestorAnswers | null;
  const source = sourceInfo();

  return (
    <InvestingClient
      profile={answers ? buildInvestorProfile(answers) : null}
      answers={answers}
      watchlist={[]}
      providerLabel={source.label}
      providerLive={source.live}
    />
  );
}

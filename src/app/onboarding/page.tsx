import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser, } from '@/lib/auth/guard';
import { getUserWorkspaces } from '@/lib/auth/session';
import { OnboardingFlow } from './flow';

export const metadata: Metadata = { title: 'Get started' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await requireUser();
  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect('/sign-up');

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <OnboardingFlow
        displayName={user.displayName}
        baseCurrency={user.baseCurrency}
        workspaceName={workspaces[0]!.name}
      />
    </div>
  );
}

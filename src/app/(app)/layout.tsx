import { requireAuth } from '@/lib/auth/guard';
import { requireOnboarded } from './onboarding-gate';
import { Sidebar, MobileTabs, MobileHeader } from './nav';
import { QuickAdd } from './quick-add';
import { PageTransition } from '@/components/ui/page-transition';
import { CompanionHost } from './companion-host';
import { TourHost } from './tour-host';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, workspaces } = await requireAuth();
  // Runs before anything renders, so a new account never sees the shell flash past
  // on its way to the setup flow.
  await requireOnboarded(user.id);
  const navWorkspaces = workspaces.map((w) => ({ id: w.id, name: w.name, kind: w.kind, isDemo: w.isDemo }));

  return (
    <div className="flex min-h-dvh bg-[var(--bg)]">
      <Sidebar workspaces={navWorkspaces} activeId={workspace.id} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader workspaces={navWorkspaces} activeId={workspace.id} />
        {/*
          Content is capped and centred so a 27" monitor does not stretch a table of
          transactions across two feet of glass. The cap lives here rather than on
          each page so every screen agrees on it.
        */}
        <main className="mx-auto w-full max-w-7xl flex-1 pb-24 md:pb-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <MobileTabs />
      <QuickAdd />
      <CompanionHost />
      <TourHost userId={user.id} />
    </div>
  );
}

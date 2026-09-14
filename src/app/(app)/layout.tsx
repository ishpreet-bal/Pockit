import { requireAuth } from '@/lib/auth/guard';
import { Sidebar, MobileTabs, MobileHeader } from './nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { workspace, workspaces } = await requireAuth();
  const navWorkspaces = workspaces.map((w) => ({ id: w.id, name: w.name, kind: w.kind, isDemo: w.isDemo }));

  return (
    <div className="flex min-h-dvh">
      <Sidebar workspaces={navWorkspaces} activeId={workspace.id} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader workspaces={navWorkspaces} activeId={workspace.id} />
        <main className="flex-1 pb-20 lg:pb-0">{children}</main>
      </div>
      <MobileTabs />
    </div>
  );
}

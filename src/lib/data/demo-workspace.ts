import 'server-only';
import { and, eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { seedCategories, seedNotificationRules } from './bootstrap';
import { seedDemoData } from './demo';

/** The sandbox's name. Also how it is recognised, together with `is_demo`. */
export const DEMO_WORKSPACE_NAME = 'Demo tour';

/**
 * A separate, disposable workspace full of example data.
 *
 * Separate is the whole point. The earlier "load demo data" filled the person's OWN
 * workspace, which meant exploring the demo cost them their real, empty account —
 * the exact complaint that started this. A sandbox next to their real workspace can
 * be entered and left freely, and nothing in it can leak into the real one: row-
 * level security scopes every query to the active workspace.
 *
 * Reused if it already exists, so visiting the demo twice does not stack sandboxes.
 */
export async function ensureDemoWorkspace(opts: {
  userId: string;
  currency: string;
  today: string;
}): Promise<string> {
  const existing = await withUser(opts.userId, (tx) =>
    tx.select({ id: workspaces.id })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(
        eq(workspaceMembers.userId, opts.userId),
        eq(workspaces.name, DEMO_WORKSPACE_NAME),
        eq(workspaces.isDemo, true),
      ))
      .limit(1),
  );
  if (existing[0]) return existing[0].id;

  const workspaceId = await withUser(opts.userId, async (tx) => {
    const rows = await tx.insert(workspaces).values({
      ownerUserId: opts.userId,
      name: DEMO_WORKSPACE_NAME,
      kind: 'personal',
      baseCurrency: opts.currency,
      isDemo: true,
    }).returning({ id: workspaces.id });
    const id = rows[0]!.id;
    await tx.insert(workspaceMembers).values({ workspaceId: id, userId: opts.userId, role: 'owner' });
    await seedCategories(tx, id);
    await seedNotificationRules(tx, id);
    return id;
  });

  await seedDemoData(opts.userId, workspaceId, opts.today);
  return workspaceId;
}

export function isDemoTour(workspace: { name: string; isDemo: boolean }): boolean {
  return workspace.isDemo && workspace.name === DEMO_WORKSPACE_NAME;
}

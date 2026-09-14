import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionUser, getUserWorkspaces, getActiveWorkspace, type SessionUser, type WorkspaceSummary } from './session';

export interface AuthContext {
  user: SessionUser;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}

/**
 * The single gate for every authenticated page.
 *
 * Returning the workspace alongside the user is deliberate: a page cannot forget to
 * scope its query, because the workspace id it needs only arrives through here.
 */
export async function requireAuth(): Promise<AuthContext> {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect('/onboarding');

  const workspace = await getActiveWorkspace(user.id, workspaces);
  if (!workspace) redirect('/onboarding');

  return { user, workspace, workspaces };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  return user;
}

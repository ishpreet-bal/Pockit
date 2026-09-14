import 'server-only';
import { NextResponse } from 'next/server';
import { getSessionUser, getUserWorkspaces, getActiveWorkspace, type SessionUser, type WorkspaceSummary } from './session';

export type ApiAuth =
  | { user: SessionUser; workspace: WorkspaceSummary }
  | { response: NextResponse };

/** Route-handler equivalent of requireAuth: returns a 401 response instead of redirecting. */
export async function requireAuthApi(): Promise<ApiAuth> {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const workspaces = await getUserWorkspaces(user.id);
  const workspace = await getActiveWorkspace(user.id, workspaces);
  if (!workspace) return { response: NextResponse.json({ error: 'No workspace' }, { status: 400 }) };

  return { user, workspace };
}

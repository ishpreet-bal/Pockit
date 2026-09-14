import { NextResponse } from 'next/server';
import { getSessionUser, getUserWorkspaces, setActiveWorkspace } from '@/lib/auth/session';

/** Switching workspace is validated against actual membership, never trusted from the client. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { workspaceId?: string } | null;
  if (!body?.workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

  const workspaces = await getUserWorkspaces(user.id);
  if (!workspaces.some((w) => w.id === body.workspaceId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await setActiveWorkspace(body.workspaceId);
  return NextResponse.json({ ok: true });
}

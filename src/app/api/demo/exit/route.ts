import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, getUserWorkspaces, setActiveWorkspace } from '@/lib/auth/session';
import { isDemoTour } from '@/lib/data/demo-workspace';

/** Leave the demo and go back to the workspace the person came from. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jar = await cookies();
  const wanted = jar.get('pockit_return_workspace')?.value;
  const workspaces = await getUserWorkspaces(user.id);
  // Validated against membership — a stale or forged cookie falls back to the
  // person's first real workspace rather than being trusted.
  const target = workspaces.find((w) => w.id === wanted && !isDemoTour(w)) ?? workspaces.find((w) => !isDemoTour(w));
  if (!target) return NextResponse.json({ error: 'No workspace to return to.' }, { status: 404 });

  await setActiveWorkspace(target.id);
  jar.delete('pockit_return_workspace');
  return NextResponse.json({ ok: true });
}

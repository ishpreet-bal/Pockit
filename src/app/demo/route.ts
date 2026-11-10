import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession, getSessionUser, getUserWorkspaces, requestContext, setActiveWorkspace } from '@/lib/auth/session';
import { createGuest } from '@/lib/auth/guest';
import { ensureDemoWorkspace, isDemoTour } from '@/lib/data/demo-workspace';
import { todayIn } from '@/lib/finance/period';

export const dynamic = 'force-dynamic';

/**
 * Enter the demo.
 *
 * A route handler rather than a page, because entering means setting the active-
 * workspace cookie, and only handlers and actions may set cookies.
 *
 * The workspace being LEFT is remembered, so "Exit demo" returns to exactly where
 * the person was rather than to whichever workspace happens to be first.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSessionUser();
  // Not signed in: "Look around first" means looking around, not signing up. A
  // guest account with sample money, straight into the app and its tour.
  if (!user) {
    const { ip, userAgent } = await requestContext();
    try {
      const made = await createGuest(ip);
      if (!made.ok) return NextResponse.redirect(new URL('/sign-up?busy=1', url));
      await createSession(made.userId, ip, userAgent);
    } catch (error) {
      // Almost always a database that hasn't been updated for this version yet
      // (or no database at all): the setup page says which, instead of a bare 500.
      console.error('Look around first failed', error);
      return NextResponse.redirect(new URL('/setup', url));
    }
    return NextResponse.redirect(new URL('/overview', url));
  }

  const workspaces = await getUserWorkspaces(user.id);
  const jar = await cookies();
  const current = jar.get('pockit_workspace')?.value;
  const returnTo = workspaces.find((w) => w.id === current && !isDemoTour(w)) ?? workspaces.find((w) => !isDemoTour(w));

  const demoId = await ensureDemoWorkspace({
    userId: user.id,
    currency: user.baseCurrency,
    today: todayIn(user.timezone),
  });

  if (returnTo) {
    jar.set('pockit_return_workspace', returnTo.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 });
  }
  await setActiveWorkspace(demoId);
  return NextResponse.redirect(new URL('/overview', url));
}

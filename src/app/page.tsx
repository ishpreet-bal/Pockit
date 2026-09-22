import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await getSessionUser();
  } catch {
    // The very first thing this page does is touch the database, so it is also the
    // first place a misconfigured deployment fails. Send people somewhere that
    // explains it instead of letting the boundary render a generic apology.
    redirect('/setup');
  }
  // A signed-out visitor meets the welcome screen, not the sign-in form. Landing
  // straight on a password field asks someone to prove who they are before anything
  // has said what this is.
  redirect(user ? '/overview' : '/welcome');
}

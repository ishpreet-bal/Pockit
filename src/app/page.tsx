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
  redirect(user ? '/overview' : '/sign-in');
}

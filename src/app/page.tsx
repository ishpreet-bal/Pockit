import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export default async function RootPage() {
  redirect((await getSessionUser()) ? '/overview' : '/sign-in');
}

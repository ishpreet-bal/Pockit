import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '../auth-form';
import { signUpAction } from '@/lib/auth/actions';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignUpPage() {
  const current = await getSessionUser();
  // A guest looking around may sign up or in; anyone else is already in.
  if (current && !current.isGuest) redirect('/overview');
  return <AuthForm mode="sign-up" action={signUpAction} />;
}

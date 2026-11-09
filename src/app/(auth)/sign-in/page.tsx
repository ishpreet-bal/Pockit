import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '../auth-form';
import { signInAction, secondFactorAction } from '@/lib/auth/actions';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  const current = await getSessionUser();
  // A guest looking around may sign up or in; anyone else is already in.
  if (current && !current.isGuest) redirect('/overview');
  return <AuthForm mode="sign-in" action={signInAction} secondFactorAction={secondFactorAction} />;
}

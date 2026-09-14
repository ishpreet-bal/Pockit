import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '../auth-form';
import { signUpAction } from '@/lib/auth/actions';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignUpPage() {
  if (await getSessionUser()) redirect('/overview');
  return <AuthForm mode="sign-up" action={signUpAction} />;
}

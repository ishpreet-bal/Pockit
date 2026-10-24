import type { Metadata } from 'next';
import { ForgotForm } from '../reset-forms';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}

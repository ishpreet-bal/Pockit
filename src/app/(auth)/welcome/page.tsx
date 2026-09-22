import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { Mascot } from '@/components/brand/mascot';
import { FadeIn } from '@/components/ui/motion';

export const metadata: Metadata = { title: 'Welcome to Pockit' };
export const dynamic = 'force-dynamic';

/**
 * The first thing anyone sees.
 *
 * Deliberately almost empty. The brief is right that a new visitor should not meet
 * a dashboard, but the subtler failure is meeting a MARKETING page — feature cards
 * and testimonials are just a different way of asking someone to read before they
 * can start. There is a greeting, a character, and two doors.
 */
export default async function WelcomePage() {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await getSessionUser();
  } catch {
    redirect('/setup');
  }
  if (user) redirect('/overview');

  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center px-6 py-12">
      <FadeIn>
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          <Mascot mood="idle" className="h-20 w-20 text-[var(--accent)]" />

          <h1 className="pk-display mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome to Pockit.
          </h1>
          <p className="mt-2 text-base text-[var(--text-muted)]">
            Your finances, made easier.
          </p>

          <Link
            href="/sign-up"
            className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent-fill)] text-base font-semibold text-[var(--accent-fill-fg)] shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
          >
            Get started
          </Link>

          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-medium text-[var(--accent)] hover:underline">
              Sign in
            </Link>
          </p>

          {/* Kept, and kept secondary. Exploring an example account is genuinely
              useful, but it is not the same thing as starting one. */}
          <Link
            href="/sign-up?demo=1"
            className="mt-8 text-xs text-[var(--text-subtle)] underline-offset-4 hover:text-[var(--text-muted)] hover:underline"
          >
            Or explore a demo account first
          </Link>
        </div>
      </FadeIn>
    </div>
  );
}

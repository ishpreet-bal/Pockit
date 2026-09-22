import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { Mascot } from '@/components/brand/mascot';
import { Ambient } from '@/components/brand/ambient';

export const metadata: Metadata = { title: 'Welcome to Pockit' };
export const dynamic = 'force-dynamic';

/**
 * The first thing anyone sees.
 *
 * Almost empty on purpose: a greeting, a character, and two doors. What makes it
 * feel welcoming rather than bare is the arrival — slow light drifting behind,
 * Pock floating up, then each line settling into place a beat after the last.
 * Nothing here moves fast, and nothing keeps moving once it has arrived except
 * the light and the otter on the water.
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
    <div className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 py-12">
      <Ambient />

      <div className="pk-assemble relative flex w-full max-w-sm flex-col items-center text-center">
        <Mascot mood="happy" className="h-28 w-28" />

        <h1 className="pk-display mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Hi, I&rsquo;m Pock.
        </h1>

        <p className="mt-3 text-base leading-relaxed text-[var(--text-muted)]">
          I&rsquo;ll help you see where your money goes, plan for what&rsquo;s next,
          and never be surprised by a bill again.
        </p>

        <Link
          href="/sign-up"
          className="mt-9 flex h-12 w-full items-center justify-center rounded-full bg-[var(--accent-fill)] text-base font-semibold text-[var(--accent-fill-fg)] shadow-[0_8px_30px_-6px_var(--accent-ring)] hover:-translate-y-0.5 hover:shadow-[0_14px_40px_-8px_var(--accent-ring)]"
        >
          Get started
        </Link>

        <p className="mt-5 text-sm text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-semibold text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>

        {/* Kept, and kept secondary. Exploring an example account is useful, but it
            is not the same thing as starting one. */}
        <Link
          href="/demo"
          className="mt-8 text-xs text-[var(--text-subtle)] underline-offset-4 hover:text-[var(--text-muted)] hover:underline"
        >
          Just looking? Try the demo first
        </Link>
      </div>
    </div>
  );
}

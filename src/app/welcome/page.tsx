import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { PockTile } from '@/components/brand/pock-mark';

export const metadata: Metadata = { title: 'Pockit: know what you can spend' };
export const dynamic = 'force-dynamic';

/**
 * The first thing anyone sees: the same screen as the iPhone app's welcome. The
 * mark, one promise in the serif, and three ways in. Nothing else competes.
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
    <div className="flex min-h-[100svh] items-center justify-center px-6 py-12">
      <div className="pk-assemble flex w-full max-w-sm flex-col">
        <PockTile />

        <h1 className="mt-8 text-[2.75rem] leading-[1.05] tracking-[-0.025em]">
          Know what you<br />can spend.
        </h1>

        <p className="mt-4 text-base leading-relaxed text-[var(--text-muted)]">
          Pockit keeps track of your bills, goals and investments, so you always know where you stand.
        </p>

        <div className="mt-12 flex flex-col gap-3">
          <Link
            href="/sign-up"
            className="flex h-[3.25rem] w-full items-center justify-center rounded-[14px] bg-[var(--accent-fill)] text-base font-semibold text-[var(--accent-fill-fg)] transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
          {/* Exploring an example account is useful, but it is not the same thing
              as starting one, so it is the quieter of the two. */}
          <Link
            href="/demo"
            className="flex h-[3.25rem] w-full items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] text-base font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]"
          >
            Look around first
          </Link>
          <Link href="/sign-in" className="mt-3 text-center text-base font-semibold text-[var(--accent)] hover:underline">
            I already have an account
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-[var(--text-subtle)]">
          Free · the demo needs no account ·{' '}
          <Link href="/privacy" className="hover:underline">Privacy</Link> ·{' '}
          <Link href="/terms" className="hover:underline">Terms</Link>
        </p>
      </div>
    </div>
  );
}

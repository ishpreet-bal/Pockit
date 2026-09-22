import Link from 'next/link';
import { Mascot } from '@/components/brand/mascot';

/**
 * Without this, Next renders its built-in 404 — white text on pure black in a dark
 * browser, with no way back. That is what "I clicked a stock and it went black"
 * was: a missing page with no navigation, indistinguishable from a crash.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
      <Mascot mood="idle" className="h-16 w-16 text-[var(--accent)]" />
      <h1 className="mt-5 text-2xl font-semibold">We couldn&rsquo;t find that.</h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
        The page may have moved, or the link is out of date.
      </p>
      <div className="mt-6 flex gap-2">
        <Link
          href="/overview"
          className="rounded-[var(--radius-control)] bg-[var(--accent-fill)] px-4 py-2 text-sm font-semibold text-[var(--accent-fill-fg)]"
        >
          Back to Pockit
        </Link>
      </div>
    </div>
  );
}

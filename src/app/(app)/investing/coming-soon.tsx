import Link from 'next/link';
import { LineChart, Home } from 'lucide-react';

/** What everyone but the admins sees in Investing while it's being finished. */
export function InvestingComingSoon() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-[var(--accent-soft)] text-[var(--accent)]">
        <LineChart className="h-7 w-7" strokeWidth={2} />
      </span>
      <h1 className="pk-display mt-5 text-2xl font-bold tracking-tight">Investing is coming soon</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        A gentle way to learn investing and follow your stocks and funds. We’re finishing it now, and it’ll appear here when it’s ready.
      </p>
      <Link href="/overview" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--border)]">
        <Home className="h-4 w-4" /> Back to Home
      </Link>
    </div>
  );
}

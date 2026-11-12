import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, LineChart } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { MORE_ITEMS } from '../nav-items';
import { getSessionUser } from '@/lib/auth/session';
import { isAdminEmail } from '@/lib/billing/plan';

export const metadata: Metadata = { title: 'More' };

/**
 * Everything that is not Home, Spending or Goals, in one quiet list.
 *
 * Investing is set apart at the top as a card rather than one row among eight,
 * because it is the one place here people go on purpose rather than when they need
 * it — the rest are tools you reach for once in a while.
 */
export default async function MorePage() {
  const admin = isAdminEmail((await getSessionUser())?.email);
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">More</h1>

      <Link href="/investing" className="block">
        <Card interactive className="flex items-center gap-4 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-soft)] text-[var(--accent)]">
            <LineChart className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Investing</span>
            <span className="block text-sm text-[var(--text-muted)]">{admin ? 'Explore stocks and funds · only you can see this' : 'Learn investing and follow your stocks'}</span>
          </span>
          {admin ? <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" /> : <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-2xs font-semibold text-[var(--text-muted)]">Coming soon</span>}
        </Card>
      </Link>

      <Card className="overflow-hidden">
        <ul>
          {MORE_ITEMS.map((item) => {
            const Ico = item.icon;
            return (
              <li key={item.href} className="border-b border-[var(--border)] last:border-0">
                <Link href={item.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-2)]">
                  <Ico className="h-[18px] w-[18px] shrink-0 text-[var(--text-muted)]" strokeWidth={1.8} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block text-xs text-[var(--text-subtle)]">{item.blurb}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

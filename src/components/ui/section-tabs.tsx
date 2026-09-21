'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/ui/cn';

export interface SectionTab {
  href: string;
  label: string;
  /** One short line explaining what this view answers. Shown under the active tab. */
  blurb?: string;
}

/**
 * Tabs across the top of a section, the way a website navigates within a topic.
 *
 * Several pages here answer different questions about the same subject — balances
 * and debts are both "what do I own and owe"; patterns and forecast are both "what
 * does this look like over time". As separate nav entries they each got their own
 * half-empty screen and made the app look bigger and thinner than it is.
 *
 * Grouping them is deliberately done here rather than by merging the routes. Each
 * page keeps its own URL, its own data fetch and its own streaming boundary, so a
 * heavy forecast query never delays a light one — but they read as one destination.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  const active = tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));

  return (
    <div className="border-b border-[var(--border)]">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Section">
        {tabs.map((tab) => {
          const on = tab === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'relative shrink-0 px-3.5 py-2.5 text-sm transition-colors',
                on
                  ? 'font-semibold text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              {tab.label}
              {on ? (
                <motion.span
                  layoutId="section-tab-underline"
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
      {active?.blurb ? (
        <p className="pb-3 pt-1 text-xs text-[var(--text-subtle)]">{active.blurb}</p>
      ) : null}
    </div>
  );
}

/* The two groupings, defined once so both members of a pair always agree. */

export const BALANCES_TABS: SectionTab[] = [
  { href: '/accounts', label: 'Balances', blurb: 'What each account holds right now, derived from your opening balance plus every transaction.' },
  { href: '/debts', label: 'Debts & payoff', blurb: 'What you owe, and what each payoff strategy costs in interest and time.' },
];

export const INSIGHTS_TABS: SectionTab[] = [
  { href: '/analytics', label: 'Patterns', blurb: 'Where your money has actually gone, month over month.' },
  { href: '/forecast', label: 'Forecast', blurb: 'Where your balance is heading, based on what repeats.' },
];

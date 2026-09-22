'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/ui/cn';

const TABS = [
  { href: '/investing', label: 'Overview', exact: true },
  { href: '/investing/stocks', label: 'Stocks' },
  { href: '/investing/etfs', label: 'ETFs' },
  { href: '/investing/crypto', label: 'Crypto' },
  { href: '/investing/watchlist', label: 'Watchlist' },
  { href: '/investing/portfolio', label: 'Portfolio' },
];

/**
 * Navigation within Investing.
 *
 * A horizontal rail rather than a second sidebar: the app already has one down the
 * left, and nesting another inside it would leave the actual content — charts and
 * tables that want width — squeezed into the middle third of the screen.
 */
export function SectionNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // On a phone the rail is wider than the screen, and the section you are actually
  // in can start off past the right edge — the app then looks like it is on
  // "Overview" whatever you clicked. Scrolling the current tab into view fixes that;
  // `block: 'nearest'` keeps it from yanking the page vertically as well.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav aria-label="Investing sections" className="-mx-1 flex gap-0.5 overflow-x-auto pb-px">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            ref={active ? activeRef : undefined}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors',
              active ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            {active ? (
              <motion.span
                layoutId="investing-tab"
                aria-hidden
                className="absolute inset-0 rounded-full bg-[var(--accent-soft)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

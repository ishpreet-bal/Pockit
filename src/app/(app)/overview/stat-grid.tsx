'use client';

import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { AnimatedNumber, Stagger, StaggerItem } from '@/components/ui/motion';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

/**
 * The four supporting figures.
 *
 * Amounts arrive as plain numbers of MINOR units, not bigints: a bigint cannot cross
 * the server/client boundary in an RSC payload. Minor units stay exact as a JS number
 * well past any balance a person will hold, so nothing is lost in the conversion.
 */
export interface Stat {
  key: string;
  label: string;
  amountMinor: number;
  note?: string;
  href?: string;
  /** Which token colours the figure. 'plain' is the default and means "just a number". */
  tone?: 'plain' | 'in' | 'out' | 'bill' | 'attention';
  /** Direction of change against the previous period, when there is one to show. */
  trend?: { direction: 'up' | 'down' | 'flat'; label: string; isGood: boolean };
}

const TONE: Record<NonNullable<Stat['tone']>, string> = {
  plain: 'text-[var(--text)]',
  in: 'text-[var(--positive)]',
  out: 'text-[var(--text)]',
  bill: 'text-[var(--warning)]',
  attention: 'text-[var(--negative)]',
};

export function StatGrid({ stats, currency }: { stats: Stat[]; currency: string }) {
  return (
    <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <StaggerItem key={s.key}>
          <StatCard stat={s} currency={currency} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function StatCard({ stat, currency }: { stat: Stat; currency: string }) {
  const Trend = stat.trend?.direction === 'up' ? ArrowUpRight
    : stat.trend?.direction === 'down' ? ArrowDownRight
    : Minus;

  const body = (
    <>
      <p className="text-xs font-medium text-[var(--text-muted)]">{stat.label}</p>
      <p className={cn('pk-figure mt-1.5 text-lg sm:text-xl', TONE[stat.tone ?? 'plain'])}>
        <AnimatedNumber
          value={stat.amountMinor}
          format={(v) => formatMoney(BigInt(Math.round(v)), currency)}
        />
      </p>
      <div className="mt-1.5 flex min-h-[18px] items-center gap-1">
        {stat.trend ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-medium',
              stat.trend.isGood
                ? 'bg-[var(--positive-soft)] text-[var(--positive)]'
                : 'bg-[var(--negative-soft)] text-[var(--negative)]',
            )}
          >
            <Trend className="h-3 w-3" strokeWidth={2.4} />
            {stat.trend.label}
          </span>
        ) : stat.note ? (
          <span className="text-2xs text-[var(--text-subtle)]">{stat.note}</span>
        ) : null}
      </div>
    </>
  );

  const shell = cn(
    'block h-full rounded-[var(--radius-card)] border border-[var(--border)] p-3.5 sm:p-4',
    // A translucent surface over the warm page tint, so the tiles read as a set that
    // belongs to the hero above rather than four more opaque cards.
    'bg-[var(--surface)]/75 backdrop-blur-sm shadow-[var(--shadow-sm)]',
  );

  return stat.href ? (
    <Link
      href={stat.href}
      className={cn(shell, 'transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]')}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

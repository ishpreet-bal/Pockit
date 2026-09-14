import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/ui/cn';
import { Money, Delta } from './money';

/**
 * A single figure with its label and its comparison.
 *
 * `href` is what turns a dashboard into something trustworthy: every number drills
 * through to the transactions that produced it.
 */
export function Stat({
  label, minor, currency, delta, deltaBasis, invertDelta, hint, href, tone, footer, className,
}: {
  label: string;
  minor: bigint;
  currency?: string;
  delta?: bigint;
  deltaBasis?: string;
  invertDelta?: boolean;
  hint?: string;
  href?: string;
  tone?: 'auto' | 'plain' | 'expense' | 'income';
  footer?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="mt-1.5">
        <Money minor={minor} currency={currency} size="xl" tone={tone ?? 'plain'} />
      </div>
      {delta !== undefined ? (
        <div className="mt-1"><Delta minor={delta} currency={currency} basis={deltaBasis} invert={invertDelta} /></div>
      ) : hint ? (
        <p className="mt-1 text-xs text-[var(--text-subtle)]">{hint}</p>
      ) : null}
      {footer}
    </>
  );

  const classes = cn(
    'block rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4',
    href && 'transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
    className,
  );

  return href ? <Link href={href} className={classes}>{body}</Link> : <div className={classes}>{body}</div>;
}

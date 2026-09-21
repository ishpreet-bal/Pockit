'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AnimatedNumber, FadeIn } from '@/components/ui/motion';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

/**
 * The one figure the dashboard exists to show, and the sentence that makes it mean
 * something.
 *
 * A bare negative number is the thing people found most alarming and least useful in
 * the old dashboard, so the explanation is not optional decoration here — it is part
 * of the component, and a caller cannot render the number without it.
 */
export function Hero({
  greeting,
  datePill,
  label,
  amountMinor,
  currency,
  explanation,
  action,
  tone,
}: {
  greeting: string;
  datePill: string;
  label: string;
  amountMinor: number;
  currency: string;
  explanation: string;
  action?: { href: string; label: string };
  tone: 'ok' | 'attention';
}) {
  return (
    <FadeIn>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{greeting}</h1>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
          {datePill}
        </span>
      </div>

      <p className="mt-6 text-sm font-medium text-[var(--text-muted)]">{label}</p>
      <p
        className={cn(
          'pk-figure mt-1 text-4xl sm:text-5xl',
          tone === 'attention' ? 'text-[var(--negative)]' : 'text-[var(--text)]',
        )}
      >
        <AnimatedNumber
          value={amountMinor}
          format={(v) => formatMoney(BigInt(Math.round(v)), currency)}
        />
      </p>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">{explanation}</p>
      {action ? (
        <Link
          href={action.href}
          className="group mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
        >
          {action.label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </FadeIn>
  );
}

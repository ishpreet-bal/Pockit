'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { contributionForMonths } from '@/lib/finance/goals';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

/**
 * "What if I gave myself longer?"
 *
 * A goal card states one required contribution derived from one target date, which
 * answers a question nobody asked — the real question is how much slack buys how much
 * relief. Dragging the timeline recalculates the monthly, fortnightly and weekly
 * amounts live, and says plainly whether the result fits the cash you actually have.
 *
 * Nothing here saves. It is a thinking tool; committing to a new date stays a
 * deliberate edit on the goal itself.
 */
export function TimelineSlider({
  remainingMinor,
  currency,
  initialMonths,
  affordableMonthlyMinor,
  locale,
}: {
  /** Minor units still to save. Passed as a number: bigint cannot cross to a client component. */
  remainingMinor: number;
  currency: string;
  /** The goal's own months-to-target, so the slider opens where the goal already is. */
  initialMonths: number;
  /** Spare cash per month, when it is known, so the verdict can be real rather than generic. */
  affordableMonthlyMinor: number | null;
  locale: string;
}) {
  const [months, setMonths] = useState(Math.min(60, Math.max(1, initialMonths || 12)));

  const { monthlyMinor, biweeklyMinor, weeklyMinor } =
    contributionForMonths(BigInt(Math.round(remainingMinor)), months);

  const monthly = Number(monthlyMinor);
  // Bound once so the verdict below can narrow it; `fits !== null` tells TypeScript
  // nothing about the prop it was derived from.
  const affordable = affordableMonthlyMinor;
  const fits = affordable === null ? null : monthly <= affordable;

  const finish = new Date();
  finish.setMonth(finish.getMonth() + months);
  const finishLabel = finish.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const pct = ((months - 1) / (60 - 1)) * 100;

  return (
    <div data-tour="goal-slider" className="mt-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.2} />
        What if I took longer?
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <span className="text-sm">
          <strong className="tabular">{months}</strong> month{months === 1 ? '' : 's'}
          <span className="text-[var(--text-subtle)]"> · finish {finishLabel}</span>
        </span>
        <span className="pk-figure text-base">
          {formatMoney(monthlyMinor, currency)}
          <span className="text-xs font-normal text-[var(--text-muted)]">/mo</span>
        </span>
      </div>

      <input
        type="range"
        min={1}
        max={60}
        step={1}
        value={months}
        aria-label="Months to reach this goal"
        aria-valuetext={`${months} months, ${formatMoney(monthlyMinor, currency)} per month`}
        onChange={(e) => setMonths(Number(e.target.value))}
        className="pk-range mt-1.5 w-full"
        style={{ ['--pk-range-pct' as string]: `${pct}%` }}
      />

      <p className="mt-1 text-xs text-[var(--text-subtle)]">
        {formatMoney(biweeklyMinor, currency)} every two weeks · {formatMoney(weeklyMinor, currency)} weekly
      </p>

      {fits !== null && affordable !== null ? (
        <p
          className={cn(
            'mt-2.5 rounded-[var(--radius-control)] px-3 py-2 text-xs leading-relaxed',
            fits
              ? 'bg-[var(--positive-soft)] text-[var(--positive)]'
              : 'bg-[var(--warning-soft)] text-[var(--warning)]',
          )}
        >
          {fits
            ? `That fits inside the ${formatMoney(BigInt(Math.round(affordable)), currency)} a month you currently have spare.`
            : `That is more than the ${formatMoney(BigInt(Math.round(affordable)), currency)} a month you currently have spare — drag further right, or free up ${formatMoney(BigInt(Math.round(monthly - affordable)), currency)}.`}
        </p>
      ) : null}
    </div>
  );
}

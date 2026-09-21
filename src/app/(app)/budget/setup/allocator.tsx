'use client';

import { CheckCircle2, AlertTriangle, CircleDashed } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export interface AllocationLine {
  key: string;
  label: string;
  basis: string;
  amountMinor: bigint;
}

/**
 * The live allocation bar.
 *
 * "Every dollar has a job" is only a useful idea if you can see, while you are
 * dragging, whether it is true yet. A number that updates is not enough — the bar
 * shows the shape of the split and reserves the leftover as a visible gap, so
 * unassigned money looks like a hole rather than like nothing at all.
 */
export function AllocationBar({
  lines, availableMinor, currency,
}: { lines: AllocationLine[]; availableMinor: bigint; currency: string }) {
  const allocated = lines.reduce((s, l) => s + l.amountMinor, 0n);
  const remaining = availableMinor - allocated;
  const denominator = allocated > availableMinor ? allocated : availableMinor;

  const state = remaining === 0n ? 'balanced' : remaining < 0n ? 'over' : 'under';
  const Icon = state === 'balanced' ? CheckCircle2 : state === 'over' ? AlertTriangle : CircleDashed;

  const copy = {
    balanced: { title: 'Every dollar has a job', tone: 'text-[var(--positive)]', wrap: 'bg-[var(--positive-soft)]' },
    over: { title: 'Over-allocated', tone: 'text-[var(--negative)]', wrap: 'bg-[var(--negative-soft)]' },
    under: { title: 'Not yet assigned', tone: 'text-[var(--warning)]', wrap: 'bg-[var(--warning-soft)]' },
  }[state];

  return (
    <div className={cn('rounded-[var(--radius-card)] px-4 py-3.5', copy.wrap)}>
      <div className="flex items-center justify-between gap-3">
        <span className={cn('flex items-center gap-1.5 text-sm font-semibold', copy.tone)}>
          <Icon className="h-4 w-4" strokeWidth={2.2} />
          {copy.title}
        </span>
        <span className={cn('tabular text-sm font-semibold', copy.tone)}>
          {state === 'balanced' ? formatMoney(0n, currency) : formatMoney(remaining, currency)}
        </span>
      </div>

      <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        {lines.filter((l) => l.amountMinor > 0n).map((l, i) => (
          <div
            key={l.key}
            className="h-full transition-[width] duration-200 ease-out"
            style={{
              width: denominator > 0n ? `${(Number(l.amountMinor) / Number(denominator)) * 100}%` : '0%',
              background: state === 'over' ? 'var(--negative)' : `var(--chart-${(i % 8) + 1})`,
            }}
            title={`${l.label}: ${formatMoney(l.amountMinor, currency)}`}
          />
        ))}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
        {state === 'balanced'
          ? 'Your whole month is accounted for. Nothing is drifting.'
          : state === 'over'
            ? `You have assigned ${formatMoney(-remaining, currency)} more than you have. Pull something down before saving.`
            : `${formatMoney(remaining, currency)} is still unassigned. It is not lost — it just has no plan, which is usually where money goes quietly.`}
      </p>
    </div>
  );
}

/**
 * One category's share, as a slider.
 *
 * Typing exact amounts into boxes is precise and slow, and it makes you do the
 * subtraction yourself. Dragging shows the trade-off directly: every dollar you give
 * one category visibly leaves the pool. An exact-entry mode stays available for
 * people who already know the number they want.
 */
export function AllocationSlider({
  line, maxMinor, currency, onChange,
}: {
  line: AllocationLine;
  maxMinor: bigint;
  currency: string;
  onChange: (minor: bigint) => void;
}) {
  const max = Number(maxMinor);
  const value = Math.min(Number(line.amountMinor), Math.max(max, Number(line.amountMinor)));
  // Roughly 200 stops across the range, rounded to whole currency units so the
  // handle lands on values a person would actually say out loud.
  const step = Math.max(100, Math.round(max / 200 / 100) * 100);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div className="py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{line.label}</p>
          <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{line.basis}</p>
        </div>
        <p className="tabular text-sm font-semibold">{formatMoney(line.amountMinor, currency)}</p>
      </div>

      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-label={`${line.label} amount`}
        aria-valuetext={formatMoney(line.amountMinor, currency)}
        onChange={(e) => onChange(BigInt(Math.round(Number(e.target.value))))}
        className="pk-range mt-2.5 w-full"
        style={{ ['--pk-range-pct' as string]: `${pct}%` }}
      />
    </div>
  );
}

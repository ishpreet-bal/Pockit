'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { PERIOD_LABELS, type PeriodPreset } from '@/lib/finance/period';
import { cn } from '@/lib/ui/cn';

export function PageHeader({
  title, description, action, children,
}: { title: string; description?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

const PRESETS: PeriodPreset[] = [
  'this_month', 'last_month', 'last_3_months', 'last_6_months', 'year_to_date', 'this_week', 'last_year',
];

export function PeriodFilter({ active }: { active: PeriodPreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(preset: PeriodPreset) {
    const next = new URLSearchParams(params.toString());
    next.set('period', preset);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Date range">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => select(preset)}
          aria-pressed={active === preset}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
            active === preset
              ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
          )}
        >
          {PERIOD_LABELS[preset as Exclude<PeriodPreset, 'custom'>]}
        </button>
      ))}
    </div>
  );
}

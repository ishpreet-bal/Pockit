import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, ProgressBar } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { formatMoney } from '@/lib/money';
import type { OverviewData } from '@/lib/finance/view/overview';

/**
 * The month at a glance, at the top of Spending.
 *
 * This is where the detail that used to crowd Home now lives: what is spent, how
 * that compares to the budget, and the three categories taking the most. One card,
 * not four tiles and a donut — each line answers a question someone actually asks
 * ("how much have I spent?", "am I over?", "on what?").
 */
export function MonthSummary({ d }: { d: OverviewData }) {
  const cur = d.currency;
  const budget = d.budgetStatus;
  const top = d.topCategories.slice(0, 3);
  const maxTop = top[0] ? Number(top[0].amountMinor) : 0;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">Spent this month</p>
        <Link href="/budget" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent)] hover:underline">
          {budget ? 'Budget' : 'Set a budget'} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <p className="mt-1">
        <Money minor={d.spent} currency={cur} size="lg" tone="plain" />
        {budget ? (
          <span className="text-sm text-[var(--text-muted)]"> of {formatMoney(budget.totalTargetMinor, cur)}</span>
        ) : null}
      </p>
      {budget ? (
        <ProgressBar
          className="mt-2.5"
          fraction={budget.totalTargetMinor > 0n ? Number(budget.totalSpentMinor) / Number(budget.totalTargetMinor) : 0}
          markerFraction={budget.elapsedFraction}
          tone={budget.totalRemainingMinor < 0n ? 'negative' : 'accent'}
        />
      ) : null}

      {top.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {top.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate">{c.icon ? `${c.icon} ` : ''}{c.name}</span>
                <span className="tabular text-[var(--text-muted)]">{formatMoney(c.amountMinor, cur)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--chart-1)]"
                  style={{ width: `${maxTop > 0 ? Math.max(4, (Number(c.amountMinor) / maxTop) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

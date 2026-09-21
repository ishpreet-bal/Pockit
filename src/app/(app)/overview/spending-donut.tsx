'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { AnimatedNumber } from '@/components/ui/motion';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export interface Slice {
  id: string;
  name: string;
  icon: string | null;
  amountMinor: number;
  shareOfSpend: number;
}

/**
 * Where the money went, as a ring with the total in the middle.
 *
 * A ring beats the stacked bars it replaces for one reason: the whole is the point.
 * Bars answer "how much on groceries"; a ring answers "how much of everything was
 * groceries", which is the question people are actually asking when they look here.
 *
 * Hovering or focusing a legend pill highlights its slice and swaps the centre figure
 * to that category, so the chart stays readable without a tooltip chasing the cursor.
 */
export function SpendingDonut({
  slices, totalMinor, currency,
}: { slices: Slice[]; totalMinor: number; currency: string }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = slices.find((s) => s.id === activeId) ?? null;
  const centreAmount = active ? active.amountMinor : totalMinor;
  const centreLabel = active ? `${active.icon ?? ''} ${active.name}`.trim() : 'Total spent';

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-[168px] w-[168px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="amountMinor"
              nameKey="name"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={2}
              stroke="none"
              // Recharts animates from the centre on mount; 600ms reads as the ring
              // drawing itself once, not as a loading state.
              animationDuration={600}
              onMouseEnter={(_, i) => setActiveId(slices[i]?.id ?? null)}
              onMouseLeave={() => setActiveId(null)}
            >
              {slices.map((s, i) => (
                <Cell
                  key={s.id}
                  fill={`var(--chart-${(i % 8) + 1})`}
                  opacity={activeId === null || activeId === s.id ? 1 : 0.32}
                  style={{ transition: 'opacity 160ms', cursor: 'pointer' }}
                  onClick={() => router.push(`/transactions?category=${s.id}`)}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="pk-figure text-lg text-[var(--text)]">
            <AnimatedNumber
              value={centreAmount}
              format={(v) => formatMoney(BigInt(Math.round(v)), currency, { compact: Math.abs(v) >= 1_000_00 })}
            />
          </span>
          <span className="mt-0.5 line-clamp-2 text-2xs leading-tight text-[var(--text-muted)]">{centreLabel}</span>
        </div>
      </div>

      <ul className="flex w-full min-w-0 flex-wrap gap-1.5 sm:flex-col sm:gap-1">
        {slices.map((s, i) => (
          <li key={s.id} className="min-w-0">
            <button
              type="button"
              onClick={() => router.push(`/transactions?category=${s.id}`)}
              onMouseEnter={() => setActiveId(s.id)}
              onMouseLeave={() => setActiveId(null)}
              onFocus={() => setActiveId(s.id)}
              onBlur={() => setActiveId(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-full border px-2.5 py-1 text-left transition-colors sm:rounded-[var(--radius-control)]',
                activeId === s.id
                  ? 'border-[var(--border-strong)] bg-[var(--surface-2)]'
                  : 'border-transparent hover:bg-[var(--surface-2)]',
              )}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: `var(--chart-${(i % 8) + 1})` }}
              />
              <span className="min-w-0 flex-1 truncate text-xs">{s.icon} {s.name}</span>
              <span className="tabular shrink-0 text-xs font-medium">
                {formatMoney(BigInt(Math.round(s.amountMinor)), currency, { compact: true })}
              </span>
              <span className="tabular w-9 shrink-0 text-right text-2xs text-[var(--text-subtle)]">
                {Math.round(s.shareOfSpend)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

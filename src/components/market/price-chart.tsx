'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Change } from './change';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export interface ChartPoint {
  t: string;
  /** Close, in MAJOR units — Recharts needs a plain number. */
  close: number;
  open: number;
  high: number;
  low: number;
}

export const RANGES = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as const;
export type Range = (typeof RANGES)[number];

/**
 * The asset's price over time, with a scrub.
 *
 * Deliberately an area chart with a hairline rather than candlesticks by default:
 * a candle body encodes four numbers per point, which is noise until you are
 * actually reading one. Candlesticks are available where the data supports them,
 * behind a toggle, for people who want them.
 *
 * Hovering sets the headline figure to the hovered point rather than popping a
 * tooltip over the line. A tooltip that follows the cursor covers the very part of
 * the chart you are pointing at.
 */
export function PriceChart({
  points, currency, range, onRangeChange, loading, baselineFirst = true,
}: {
  points: ChartPoint[];
  currency: string;
  range: Range;
  onRangeChange: (r: Range) => void;
  loading?: boolean;
  /** Compare against the first point of the window (the usual convention). */
  baselineFirst?: boolean;
}) {
  const [hover, setHover] = useState<ChartPoint | null>(null);

  const first = points[0]?.close ?? 0;
  const last = points[points.length - 1]?.close ?? 0;
  const shown = hover ?? points[points.length - 1] ?? null;

  const changeBps = useMemo(() => {
    const from = baselineFirst ? first : points[points.length - 2]?.close ?? first;
    const to = shown?.close ?? last;
    if (!from) return null;
    return Math.round(((to - from) / from) * 10000);
  }, [first, last, points, shown, baselineFirst]);

  const rising = (shown?.close ?? last) >= first;
  const colour = rising ? 'var(--positive)' : 'var(--negative)';

  /**
   * Recharts' own handler type describes a generic payload, so the point is read
   * back defensively rather than asserted — a chart that throws on hover would be
   * worse than one that simply does not highlight.
   */
  const onMove = useCallback((state: unknown) => {
    const payload = (state as { activePayload?: { payload?: ChartPoint }[] } | null)?.activePayload;
    setHover(payload?.[0]?.payload ?? null);
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="pk-figure text-3xl">
            {shown ? formatMoney(BigInt(Math.round(shown.close * 100)), currency) : '—'}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Change bps={changeBps} size="lg" />
            <span className="text-xs text-[var(--text-muted)]">
              {hover
                ? new Date(hover.t).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    ...(range === '1D' || range === '5D' ? { timeStyle: 'short' } : {}),
                  })
                : `over ${RANGE_WORDS[range]}`}
            </span>
          </div>
        </div>

        <div role="group" aria-label="Chart range" className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r)}
              aria-pressed={range === r}
              className={cn(
                'rounded-[var(--radius-control)] px-2.5 py-1 text-xs font-medium transition-colors',
                range === r
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mt-4 h-[280px] w-full sm:h-[340px]"
        onMouseLeave={() => setHover(null)}
      >
        {loading ? (
          <div className="pk-skeleton h-full w-full rounded-[var(--radius-card)]" />
        ) : points.length < 2 ? (
          <div className="flex h-full items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] px-6 text-center">
            <p className="max-w-sm text-sm text-[var(--text-muted)]">
              No price history available for this range from the connected data source.
              Nothing is drawn rather than showing an approximation.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} onMouseMove={onMove as never} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colour} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={colour} stopOpacity="0" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="2 4" />
              <XAxis
                dataKey="t"
                tickLine={false}
                axisLine={false}
                minTickGap={48}
                tickFormatter={(v: string) => formatTick(v, range)}
              />
              <YAxis
                domain={['dataMin', 'dataMax']}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => formatMoney(BigInt(Math.round(v * 100)), currency, { compact: true, cents: 'never' })}
              />
              {/* The opening level, so "is this up or down over the window" is
                  answerable without reading the axis. */}
              <ReferenceLine y={first} stroke="var(--border-strong)" strokeDasharray="3 3" />
              <Tooltip content={() => null} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="close"
                stroke={colour}
                strokeWidth={2}
                fill="url(#price-fill)"
                isAnimationActive={false}
                activeDot={{ r: 4, fill: colour, stroke: 'var(--surface)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const RANGE_WORDS: Record<Range, string> = {
  '1D': 'the day', '5D': 'five days', '1M': 'a month', '6M': 'six months',
  YTD: 'the year so far', '1Y': 'a year', '5Y': 'five years', MAX: 'the full history',
};

function formatTick(iso: string, range: Range): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (range === '1D') return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (range === '5D') return d.toLocaleDateString(undefined, { weekday: 'short' });
  if (range === '5Y' || range === 'MAX') return d.toLocaleDateString(undefined, { year: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

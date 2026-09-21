'use client';

import { useId } from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * A price line small enough to sit inside a row.
 *
 * Hand-drawn as an SVG path rather than delegated to a chart library: at this size
 * there are no axes, no tooltip and no legend to configure, and a chart component
 * would cost several kilobytes per row for a polyline.
 *
 * It is decoration for scale, not for reading values, so it is hidden from screen
 * readers — the number beside it is the accessible version.
 */
export function Sparkline({
  values, className, width = 96, height = 28, tone = 'auto',
}: {
  /** Closing prices, oldest first. */
  values: number[];
  className?: string;
  width?: number;
  height?: number;
  tone?: 'auto' | 'neutral';
}) {
  const id = useId();
  if (values.length < 2) {
    return <div className={cn('h-7 w-24', className)} aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width - pad},${height} L${pad},${height} Z`;

  const rising = values[values.length - 1]! >= values[0]!;
  const colour = tone === 'neutral'
    ? 'var(--text-subtle)'
    : rising ? 'var(--positive)' : 'var(--negative)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.18" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={colour} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

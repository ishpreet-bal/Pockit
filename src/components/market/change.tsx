import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

/**
 * A price change.
 *
 * Colour is never the only signal: every change also carries an arrow and, where
 * there is room, a sign. Roughly one man in twelve cannot reliably separate the red
 * from the green, and a financial figure that only they cannot read is a bug.
 */
export function Change({
  bps, className, size = 'md', showArrow = true,
}: {
  bps: number | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showArrow?: boolean;
}) {
  if (bps === null) {
    return <span className={cn('text-[var(--text-subtle)]', className)}>—</span>;
  }

  const up = bps > 0;
  const flat = bps === 0;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-0.5 font-semibold',
        size === 'lg' ? 'text-base' : size === 'sm' ? 'text-2xs' : 'text-xs',
        flat ? 'text-[var(--text-muted)]' : up ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
        className,
      )}
    >
      {showArrow ? <Icon className={size === 'lg' ? 'h-4 w-4' : 'h-3 w-3'} strokeWidth={2.6} /> : null}
      {flat ? '0.00' : `${up ? '+' : '−'}${Math.abs(bps / 100).toFixed(2)}`}%
      <span className="sr-only">{flat ? 'unchanged' : up ? 'up' : 'down'}</span>
    </span>
  );
}

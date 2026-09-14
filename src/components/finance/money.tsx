import { formatMoney, formatMoneyParts, type FormatOptions } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

/**
 * The one component that renders money. Having exactly one guarantees that a figure
 * looks the same on every screen and always uses tabular numerals.
 */
export function Money({
  minor, currency = 'CAD', className, size = 'md', tone = 'auto', options,
}: {
  minor: bigint;
  currency?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** 'auto' colours by sign; 'plain' never colours; 'expense'/'income' force it. */
  tone?: 'auto' | 'plain' | 'expense' | 'income';
  options?: FormatOptions;
}) {
  const parts = formatMoneyParts(minor, currency, options);
  const toneClass =
    tone === 'plain' ? ''
    : tone === 'income' ? 'text-[var(--positive)]'
    : tone === 'expense' ? 'text-[var(--negative)]'
    : minor < 0n ? 'text-[var(--negative)]'
    : minor > 0n ? '' : 'text-[var(--text-muted)]';

  const sizeClass =
    size === 'xl' ? 'text-2xl font-semibold'
    : size === 'lg' ? 'text-lg font-semibold'
    : size === 'sm' ? 'text-sm' : 'text-base font-medium';

  return (
    <span className={cn('tabular whitespace-nowrap', sizeClass, toneClass, className)}>
      {parts.sign}
      <span className="opacity-55">{parts.symbol}</span>
      {parts.whole}
      {parts.fraction ? <span className="opacity-55">{parts.fraction}</span> : null}
    </span>
  );
}

/** A signed change with its comparison basis stated — a delta without a basis is noise. */
export function Delta({
  minor, currency = 'CAD', basis, invert = false, className,
}: { minor: bigint; currency?: string; basis?: string; invert?: boolean; className?: string }) {
  const isUp = minor > 0n;
  const isGood = invert ? !isUp : isUp;
  const color = minor === 0n ? 'text-[var(--text-subtle)]' : isGood ? 'text-[var(--positive)]' : 'text-[var(--negative)]';
  return (
    <span className={cn('inline-flex items-baseline gap-1 text-xs', className)}>
      <span className={cn('tabular font-medium', color)} aria-hidden>
        {minor === 0n ? '—' : isUp ? '▲' : '▼'} {formatMoney(minor < 0n ? -minor : minor, currency, { cents: 'auto' })}
      </span>
      <span className="sr-only">
        {minor === 0n ? 'no change' : `${isUp ? 'up' : 'down'} ${formatMoney(minor < 0n ? -minor : minor, currency)}`}
      </span>
      {basis ? <span className="text-[var(--text-subtle)]">{basis}</span> : null}
    </span>
  );
}

export function Percent({ bps, className, signed = false }: { bps: number; className?: string; signed?: boolean }) {
  const value = bps / 100;
  const sign = signed && value > 0 ? '+' : '';
  return <span className={cn('tabular', className)}>{sign}{value.toFixed(value % 1 === 0 ? 0 : 1)}%</span>;
}

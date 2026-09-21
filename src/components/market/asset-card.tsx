'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { Change } from './change';
import { Sparkline } from './sparkline';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export interface AssetSummary {
  symbol: string;
  name: string;
  kind: 'stock' | 'etf' | 'crypto';
  exchange: string | null;
  /** Null when no source could price it — shown as unavailable, never as zero. */
  priceMinor: number | null;
  currency: string;
  changeBps: number | null;
  spark: number[];
  simulated: boolean;
  /** ETFs only, in basis points. */
  expenseRatioBps?: number | null;
  tracks?: string | null;
  sector?: string | null;
}

const KIND_LABEL = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto' } as const;

/**
 * One instrument, as a card.
 *
 * The whole card is the link. A card where only the title is clickable teaches
 * people to aim carefully at small text, which is exactly the fiddliness this
 * redesign is meant to remove.
 */
export function AssetCard({
  asset, watched, onToggleWatch, selected, onToggleSelect,
}: {
  asset: AssetSummary;
  watched?: boolean;
  onToggleWatch?: (symbol: string) => void;
  selected?: boolean;
  onToggleSelect?: (symbol: string) => void;
}) {
  return (
    <div
      className={cn(
        'group relative rounded-[var(--radius-card)] border bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]',
        selected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--border)]',
      )}
    >
      <Link href={`/investing/${encodeURIComponent(asset.symbol)}`} className="block p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="pk-display text-sm font-bold tracking-tight">{asset.symbol}</p>
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{asset.name}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-2xs font-medium text-[var(--text-muted)]">
            {KIND_LABEL[asset.kind]}
          </span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="pk-figure text-lg">
              {asset.priceMinor === null
                ? <span className="text-sm font-normal text-[var(--text-subtle)]">No price</span>
                : formatMoney(BigInt(Math.round(asset.priceMinor)), asset.currency)}
            </p>
            <Change bps={asset.changeBps} className="mt-0.5" />
          </div>
          <Sparkline values={asset.spark} className="shrink-0" />
        </div>

        {asset.tracks || asset.sector ? (
          <p className="mt-2.5 truncate border-t border-[var(--border)] pt-2 text-2xs text-[var(--text-subtle)]">
            {asset.tracks ?? asset.sector}
            {asset.expenseRatioBps != null ? ` · ${(asset.expenseRatioBps / 100).toFixed(2)}% a year` : ''}
          </p>
        ) : null}
      </Link>

      {/* Controls sit outside the link so they do not navigate. */}
      <div className="absolute right-2.5 top-11 flex gap-1">
        {onToggleSelect ? (
          <button
            type="button"
            onClick={() => onToggleSelect(asset.symbol)}
            aria-pressed={selected}
            aria-label={selected ? `Remove ${asset.symbol} from comparison` : `Add ${asset.symbol} to comparison`}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-full border text-2xs font-bold transition-colors',
              selected
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] opacity-0 hover:border-[var(--border-strong)] group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            {selected ? '✓' : '+'}
          </button>
        ) : null}
        {onToggleWatch ? (
          <button
            type="button"
            onClick={() => onToggleWatch(asset.symbol)}
            aria-pressed={watched}
            aria-label={watched ? `Unfollow ${asset.symbol}` : `Follow ${asset.symbol}`}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-full border transition-colors',
              watched
                ? 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] opacity-0 hover:border-[var(--border-strong)] group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            <Star className="h-3.5 w-3.5" fill={watched ? 'currentColor' : 'none'} strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The same data as a dense row, for people who would rather scan a table. */
export function AssetRow({
  asset, watched, onToggleWatch,
}: {
  asset: AssetSummary;
  watched?: boolean;
  onToggleWatch?: (symbol: string) => void;
}) {
  return (
    <tr className="group border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]">
      <td className="py-2.5 pl-3 pr-2">
        <Link href={`/investing/${encodeURIComponent(asset.symbol)}`} className="block">
          <span className="pk-display block text-sm font-bold">{asset.symbol}</span>
          <span className="block truncate text-2xs text-[var(--text-muted)]">{asset.name}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-right">
        <span className="tabular text-sm font-semibold">
          {asset.priceMinor === null ? '—' : formatMoney(BigInt(Math.round(asset.priceMinor)), asset.currency)}
        </span>
      </td>
      <td className="px-2 py-2.5 text-right"><Change bps={asset.changeBps} /></td>
      <td className="hidden px-2 py-2.5 sm:table-cell"><Sparkline values={asset.spark} width={72} height={24} /></td>
      <td className="hidden px-2 py-2.5 text-right text-2xs text-[var(--text-subtle)] md:table-cell">
        {asset.expenseRatioBps != null ? `${(asset.expenseRatioBps / 100).toFixed(2)}%` : asset.sector ?? asset.exchange ?? '—'}
      </td>
      <td className="py-2.5 pl-2 pr-3 text-right">
        {onToggleWatch ? (
          <button
            type="button"
            onClick={() => onToggleWatch(asset.symbol)}
            aria-pressed={watched}
            aria-label={watched ? `Unfollow ${asset.symbol}` : `Follow ${asset.symbol}`}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-full transition-colors',
              watched ? 'text-[var(--warning)]' : 'text-[var(--text-subtle)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            <Star className="h-3.5 w-3.5" fill={watched ? 'currentColor' : 'none'} strokeWidth={2} />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

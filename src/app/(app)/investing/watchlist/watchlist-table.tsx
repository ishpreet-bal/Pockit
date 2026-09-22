'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AssetCard, AssetRow, type AssetSummary } from '@/components/market/asset-card';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

/**
 * The things you are following.
 *
 * Same two views as discovery, and the same star control, so following and
 * unfollowing work identically wherever an instrument appears.
 */
export function WatchlistTable({ assets, listId }: { assets: AssetSummary[]; listId: string }) {
  const router = useRouter();
  const [view, setView] = useState<'cards' | 'table'>('table');
  const [following, setFollowing] = useState(assets.map((a) => a.symbol));

  async function unfollow(symbol: string) {
    setFollowing((prev) => prev.filter((s) => s !== symbol));
    await fetch(`/api/investing/watchlist?symbol=${encodeURIComponent(symbol)}&listId=${encodeURIComponent(listId)}`, { method: 'DELETE' })
      .catch(() => { /* the refresh below reconciles */ });
    router.refresh();
  }

  const shown = assets.filter((a) => following.includes(a.symbol));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          {shown.length} instrument{shown.length === 1 ? '' : 's'}
        </p>
        <div role="group" aria-label="View" className="flex rounded-[var(--radius-control)] bg-[var(--surface-2)] p-0.5">
          {([['cards', LayoutGrid, 'Cards'], ['table', Rows3, 'Table']] as const).map(([mode, Icon, label]) => (
            <button
              key={mode} type="button" onClick={() => setView(mode)} aria-pressed={view === mode} title={label}
              className={cn(
                'grid h-7 w-8 place-items-center rounded-md transition-colors',
                view === mode ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-subtle)]',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.9} />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((a) => (
            <AssetCard key={a.symbol} asset={a} watched onToggleWatch={(s) => void unfollow(s)} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-2xs uppercase tracking-wide text-[var(--text-subtle)]">
                <th className="py-2 pl-3 pr-2 text-left font-medium">Instrument</th>
                <th className="px-2 py-2 text-right font-medium">Price</th>
                <th className="px-2 py-2 text-right font-medium">Change</th>
                <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">1 month</th>
                <th className="hidden px-2 py-2 text-right font-medium md:table-cell">Cost / sector</th>
                <th className="py-2 pl-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <AssetRow key={a.symbol} asset={a} watched onToggleWatch={(s) => void unfollow(s)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

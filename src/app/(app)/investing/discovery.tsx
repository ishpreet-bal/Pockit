'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Rows3, GitCompare, X } from 'lucide-react';
import { AssetCard, AssetRow, type AssetSummary } from '@/components/market/asset-card';
import { Provenance } from '@/components/market/provenance';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/ui/cn';

export interface CollectionGroup {
  id: string;
  label: string;
  blurb: string;
  assets: AssetSummary[];
}

/**
 * Browsing a kind of instrument.
 *
 * Organised into named collections rather than one long table, because "show me
 * everything" is not a question anyone actually has. Each collection states the rule
 * that put things in it — these are lists defined by a stated criterion, never a
 * ranking of what is "best", which is not something this app can honestly claim.
 */
export function Discovery({
  groups, sourceLabel, live, methodology, watched,
}: {
  groups: CollectionGroup[];
  sourceLabel: string;
  live: boolean;
  /** How this set of lists was built, shown in full rather than summarised away. */
  methodology: string;
  watched: string[];
}) {
  const router = useRouter();
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [activeId, setActiveId] = useState(groups[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>(watched);

  const active = useMemo(() => groups.find((g) => g.id === activeId) ?? groups[0], [groups, activeId]);

  async function toggleWatch(symbol: string) {
    const on = following.includes(symbol);
    setFollowing((prev) => (on ? prev.filter((s) => s !== symbol) : [...prev, symbol]));
    await (on
      ? fetch(`/api/investing/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' })
      : fetch('/api/investing/watchlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ symbol }),
        })
    ).catch(() => { /* optimistic; the next load reconciles */ });
    router.refresh();
  }

  function toggleSelect(symbol: string) {
    setSelected((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : prev.length >= 4 ? prev : [...prev, symbol],
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Collections" className="-mx-1 flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={g.id === active?.id}
              onClick={() => setActiveId(g.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs transition-colors',
                g.id === active?.id
                  ? 'border-transparent bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
              )}
            >
              {g.label}
              <span className="ml-1.5 text-[var(--text-subtle)]">{g.assets.length}</span>
            </button>
          ))}
        </div>

        <div role="group" aria-label="View" className="flex rounded-[var(--radius-control)] bg-[var(--surface-2)] p-0.5">
          {([['cards', LayoutGrid, 'Cards'], ['table', Rows3, 'Table']] as const).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
              title={label}
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

      {active ? (
        <>
          <p className="mt-4 text-sm text-[var(--text-muted)]">{active.blurb}</p>

          {view === 'cards' ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {active.assets.map((a) => (
                <AssetCard
                  key={a.symbol}
                  asset={a}
                  watched={following.includes(a.symbol)}
                  onToggleWatch={(s) => void toggleWatch(s)}
                  selected={selected.includes(a.symbol)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
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
                  {active.assets.map((a) => (
                    <AssetRow
                      key={a.symbol}
                      asset={a}
                      watched={following.includes(a.symbol)}
                      onToggleWatch={(s) => void toggleWatch(s)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface-2)] px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">How this list was built</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{methodology}</p>
            <Provenance source={sourceLabel} asOf={new Date().toISOString()} simulated={!live} className="mt-1.5" />
          </div>
        </>
      ) : null}

      {/* The comparison tray only exists once something is selected. */}
      {selected.length > 0 ? (
        <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-lg)] md:bottom-6">
          <span className="text-xs font-semibold">Compare</span>
          {selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] py-1 pl-2.5 pr-1 text-xs font-medium">
              {s}
              <button type="button" onClick={() => toggleSelect(s)} aria-label={`Remove ${s}`} className="grid h-4 w-4 place-items-center rounded-full hover:bg-[var(--surface-3)]">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setSelected([])}>Clear</Button>
            <Button
              size="sm"
              variant="primary"
              disabled={selected.length < 2}
              onClick={() => router.push(`/investing/compare?symbols=${selected.join(',')}`)}
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare {selected.length}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

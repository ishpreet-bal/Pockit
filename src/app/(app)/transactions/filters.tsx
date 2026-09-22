'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/ui/cn';

interface Choice { id: string; name: string; isPrimary?: boolean }

/**
 * Narrowing the list down.
 *
 * Everything lives in the URL rather than in component state, so a filtered view is
 * a link: it survives a refresh, it can be bookmarked, and the back button undoes a
 * filter instead of leaving the page.
 *
 * The top-level categories are offered as chips because "just show me food" is the
 * thing people actually want, and making them open a dropdown to get it is the
 * difference between a filter they use and one they do not.
 */
export function TransactionFilters({
  categories, accounts,
}: { categories: Choice[]; accounts: Choice[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const activeCategory = params.get('category') ?? '';
  const activeAccount = params.get('account') ?? '';
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [showMore, setShowMore] = useState(Boolean(activeAccount));
  const first = useRef(true);

  /** Rewrite one parameter, dropping it when empty so URLs stay readable. */
  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === '') next.delete(key);
      else next.set(key, value);
    }
    router.replace(`/transactions?${next.toString()}`, { scroll: false });
  }

  // Typing is debounced, because every change is a server round trip. The first
  // run is skipped so arriving with ?q= in the URL does not immediately re-navigate.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const timer = setTimeout(() => apply({ q: query.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const primary = categories.filter((c) => c.isPrimary);
  const anyFilter = activeCategory !== '' || activeAccount !== '' || query.trim() !== '';

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search description, merchant or category"
            aria-label="Search transactions"
            className="pl-8"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-sm transition-colors',
            showMore || activeAccount
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">More</span>
        </button>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {primary.map((c) => {
          const on = activeCategory === c.id;
          return (
            <button
              key={c.id}
              type="button"
              // Tapping the active chip clears it. A filter you cannot turn off
              // without hunting for a reset button is a trap.
              onClick={() => apply({ category: on ? '' : c.id })}
              aria-pressed={on}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                on
                  ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
              )}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {showMore ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            Account
            <Select
              value={activeAccount}
              onChange={(e) => apply({ account: e.target.value })}
              className="h-8 w-auto min-w-[10rem] py-0 text-sm"
            >
              <option value="">Any account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            Category
            <Select
              value={activeCategory}
              onChange={(e) => apply({ category: e.target.value })}
              className="h-8 w-auto min-w-[10rem] py-0 text-sm"
            >
              <option value="">Any category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
        </div>
      ) : null}

      {anyFilter ? (
        <button
          type="button"
          onClick={() => { setQuery(''); apply({ q: '', category: '', account: '' }); }}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
        >
          <X className="h-3 w-3" />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

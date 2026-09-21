'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search, X } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export interface RecentItem {
  id: string;
  description: string;
  date: string;
  categoryName: string | null;
  categoryIcon: string | null;
  /** Signed minor units: positive is money in, negative is money out. */
  signedMinor: number;
  bucket: 'income' | 'bill' | 'discretionary';
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'bill', label: 'Bills' },
  { key: 'discretionary', label: 'Discretionary' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

/**
 * Recent activity with search and filters.
 *
 * Filtering happens in the browser over a list that is already small and already
 * loaded. A round trip per keystroke would be slower and no more correct, and the
 * full-history search on /transactions is one click away for anything wider.
 */
export function RecentActivity({
  items, currency, locale,
}: { items: RecentItem[]; currency: string; locale: string }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((t) => {
      if (filter !== 'all' && t.bucket !== filter) return false;
      if (q === '') return true;
      return (
        t.description.toLowerCase().includes(q) ||
        (t.categoryName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, filter]);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recent activity"
            aria-label="Search recent activity"
            className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-9 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div role="group" aria-label="Filter activity" className="flex gap-1.5 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors',
                filter === f.key
                  ? 'border-transparent bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            {items.length === 0
              ? 'Nothing here yet.'
              : 'Nothing matches that. Try a different word, or search all your history.'}
            {items.length > 0 ? (
              <>
                {' '}
                <Link href="/transactions" className="font-medium text-[var(--accent)] hover:underline">
                  Search everything
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <ul>
            {shown.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 transition-colors last:border-0 hover:bg-[var(--surface-2)]"
              >
                {/* Direction, not decoration. An arrow says which way the money went
                    in every language and at every font size; the category emoji it
                    replaces said nothing the label beneath does not already say. */}
                <span
                  aria-hidden
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                    t.signedMinor > 0
                      ? 'bg-[var(--positive-soft)] text-[var(--positive)]'
                      : 'bg-[var(--surface-2)] text-[var(--text-subtle)]',
                  )}
                >
                  {t.signedMinor > 0
                    ? <ArrowDownLeft className="h-4 w-4" strokeWidth={2.2} />
                    : <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.description}</p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    {new Date(`${t.date}T12:00:00Z`).toLocaleDateString(locale, {
                      month: 'short', day: 'numeric', timeZone: 'UTC',
                    })}
                    {t.categoryName ? ` · ${t.categoryName}` : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'tabular shrink-0 text-sm font-semibold',
                    t.signedMinor > 0 ? 'text-[var(--positive)]' : 'text-[var(--text)]',
                  )}
                >
                  {t.signedMinor > 0 ? '+' : ''}
                  {formatMoney(BigInt(Math.round(t.signedMinor)), currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

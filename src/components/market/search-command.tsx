'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import type { SearchResult } from '@/lib/market/types';
import { cn } from '@/lib/ui/cn';

const RECENTS_KEY = 'pockit-market-recents';
const KIND_LABEL = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto' } as const;

/**
 * Find an instrument by typing.
 *
 * Results appear from the first character and update as you type, with full keyboard
 * control, because searching is how most sessions here will start. Matching is done
 * server-side against the catalogue and is case-insensitive, punctuation-insensitive
 * and typo-tolerant — see `lib/market/search.ts`.
 *
 * Requests are debounced and, more importantly, stale responses are discarded: typing
 * quickly fires several requests and they do not necessarily return in order, so
 * without a sequence check the list can flicker back to an earlier query's results.
 */
export function SearchCommand({
  autoFocus, placeholder = 'Search any stock, ETF or crypto', className, onPick,
}: {
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  /** When given, picking calls this instead of navigating. */
  onPick?: (symbol: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);

  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    try { setRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as string[]); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q === '') { setResults([]); setBusy(false); return; }

    setBusy(true);
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { results?: SearchResult[] };
        // Ignore anything but the newest request.
        if (mine !== seq.current) return;
        setResults(body.results ?? []);
        setActive(0);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [query]);

  // Clicking anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const showRecents = query.trim() === '' && recents.length > 0;
  const items = useMemo(
    () => (showRecents ? recents.map((symbol) => ({ symbol, name: '', kind: 'stock' as const, exchange: null, score: 0, matched: [] })) : results),
    [showRecents, recents, results],
  );

  function pick(symbol: string) {
    const next = [symbol, ...recents.filter((r) => r !== symbol)].slice(0, 6);
    setRecents(next);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    setOpen(false);
    setQuery('');
    if (onPick) onPick(symbol);
    else router.push(`/investing/${encodeURIComponent(symbol)}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      const chosen = items[active];
      if (chosen) { e.preventDefault(); pick(chosen.symbol); }
    } else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="market-search-results"
        aria-autocomplete="list"
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] pl-10 pr-10 text-sm shadow-[var(--shadow-sm)] transition-colors focus:border-[var(--accent)] focus:outline-none"
      />
      {busy ? (
        <Loader2 aria-hidden className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-[pk-spin_0.8s_linear_infinite] text-[var(--text-subtle)]" />
      ) : query ? (
        <button
          type="button" onClick={() => { setQuery(''); setResults([]); }} aria-label="Clear search"
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {open && (items.length > 0 || (query.trim() !== '' && !busy)) ? (
        <div
          id="market-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        >
          {showRecents ? (
            <p className="px-3 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Recent</p>
          ) : null}

          {items.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-[var(--text-muted)]">
              Nothing matches “{query.trim()}”. Try a company name, or a ticker like VOO.
            </p>
          ) : (
            <ul>
              {items.map((r, i) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(r.symbol)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
                      i === active ? 'bg-[var(--surface-2)]' : '',
                    )}
                  >
                    <span className="pk-display w-16 shrink-0 text-sm font-bold">
                      {r.matched.some((m) => m.field === 'symbol')
                        ? <Highlighted text={r.symbol} matched={r.matched.filter((m) => m.field === 'symbol')} />
                        : r.symbol}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {r.matched.some((m) => m.field === 'name')
                          ? <Highlighted text={r.name} matched={r.matched.filter((m) => m.field === 'name')} />
                          : r.name}
                      </span>
                      {r.name ? (
                        <span className="block text-2xs text-[var(--text-subtle)]">
                          {KIND_LABEL[r.kind]}{r.exchange ? ` · ${r.exchange}` : ''}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Bolds the part of the text that matched, so it is obvious why a row is here. */
function Highlighted({ text, matched }: { text: string; matched: { start: number; end: number }[] }) {
  const m = matched[0];
  if (!m) return <>{text}</>;
  return (
    <>
      {text.slice(0, m.start)}
      <mark className="bg-transparent font-bold text-[var(--accent)]">{text.slice(m.start, m.end)}</mark>
      {text.slice(m.end)}
    </>
  );
}

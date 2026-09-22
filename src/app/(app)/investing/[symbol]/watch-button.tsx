'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Star } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

interface ListRef { id: string; name: string }

/**
 * Follow or unfollow, and — when there is more than one list — choose which.
 *
 * The primary button stays a single tap onto the first list, because "follow this"
 * is the common case and making it a two-step menu would tax it for the sake of the
 * rare one. The lists live behind the caret, ticked where the symbol already is.
 *
 * State flips immediately and reverts if the server disagrees.
 */
export function WatchButton({
  symbol, name, lists, onLists,
}: { symbol: string; name: string; lists: ListRef[]; onLists: string[] }) {
  const router = useRouter();
  const [on, setOn] = useState<string[]>(onLists);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Server state wins after a refresh; without this the menu keeps showing the
  // optimistic ticks even when a write was rejected.
  useEffect(() => { setOn(onLists); }, [onLists]);

  useEffect(() => {
    if (!open) return;
    function away(event: MouseEvent) {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', escape); };
  }, [open]);

  const watched = on.length > 0;

  async function toggleList(listId: string) {
    const adding = !on.includes(listId);
    setOn((prev) => (adding ? [...prev, listId] : prev.filter((id) => id !== listId)));
    setBusy(true);
    try {
      const response = adding
        ? await fetch('/api/investing/watchlist', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ symbol, name, listId }),
          })
        : await fetch(
            `/api/investing/watchlist?symbol=${encodeURIComponent(symbol)}&listId=${encodeURIComponent(listId)}`,
            { method: 'DELETE' },
          );
      // A 409 means it was already there, which is the state we just moved to — not
      // a reason to flip the tick back off.
      if (!response.ok && response.status !== 409) throw new Error(String(response.status));
      router.refresh();
    } catch {
      setOn((prev) => (adding ? prev.filter((id) => id !== listId) : [...prev, listId]));
    } finally {
      setBusy(false);
    }
  }

  /** The plain button: follow onto the first list, or unfollow from everywhere. */
  async function primary() {
    if (!watched) {
      const first = lists[0];
      if (first) await toggleList(first.id);
      return;
    }
    const previous = on;
    setOn([]);
    setBusy(true);
    try {
      await fetch(`/api/investing/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      setOn(previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrap} className="relative inline-flex">
      <Button
        variant={watched ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={() => void primary()}
        className={lists.length > 1 ? 'rounded-r-none' : undefined}
      >
        <Star className="h-4 w-4" fill={watched ? 'currentColor' : 'none'} strokeWidth={2} />
        {watched ? (on.length > 1 ? `On ${on.length} lists` : 'Following') : 'Follow'}
      </Button>

      {lists.length > 1 ? (
        <>
          <Button
            variant={watched ? 'secondary' : 'primary'}
            aria-label="Choose lists"
            aria-expanded={open}
            aria-haspopup="menu"
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
            className="-ml-px rounded-l-none px-2"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>

          {open ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)]"
            >
              {lists.map((list) => {
                const ticked = on.includes(list.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={ticked}
                    disabled={busy}
                    onClick={() => void toggleList(list.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    <Check className={`h-3.5 w-3.5 shrink-0 ${ticked ? 'text-[var(--accent)]' : 'opacity-0'}`} />
                    <span className="truncate">{list.name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

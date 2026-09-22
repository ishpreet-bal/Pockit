'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button, Input } from '@/components/ui/primitives';
import { cn } from '@/lib/ui/cn';

export interface ListSummary {
  id: string;
  name: string;
  count: number;
}

/**
 * The named lists, as tabs.
 *
 * Tabs rather than a dropdown because the whole point of separate lists is seeing at
 * a glance that "Long term" has eleven things on it and "Research" has two. A
 * dropdown hides exactly the information the feature exists to show.
 *
 * Renaming happens in place, on the tab itself. A modal for a single text field is a
 * lot of ceremony for changing one word.
 */
export function ListTabs({ lists, activeId }: { lists: ListSummary[]; activeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which editor is open: a list id to rename, 'new' to create, or null. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  async function send(input: RequestInfo, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'That did not work. Try again.');
        return false;
      }
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const name = draft.trim();
    if (name === '' || editing === null) return;
    const ok = editing === 'new'
      ? await send('/api/investing/watchlists', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name }),
        })
      : await send('/api/investing/watchlists', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: editing, name }),
        });
    if (!ok) return;
    setEditing(null);
    setDraft('');
    router.refresh();
  }

  async function remove(id: string, name: string) {
    // A list deletes its contents with it, so the count goes in the question. "Delete
    // Research?" and "Delete Research and the 14 things on it?" are different asks.
    const count = lists.find((l) => l.id === id)?.count ?? 0;
    const suffix = count === 0 ? '' : ` and the ${count} instrument${count === 1 ? '' : 's'} on it`;
    if (!window.confirm(`Delete “${name}”${suffix}? This cannot be undone.`)) return;
    if (await send(`/api/investing/watchlists?id=${encodeURIComponent(id)}`, { method: 'DELETE' })) {
      router.push('/investing/watchlist');
      router.refresh();
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {lists.map((list) => {
          const active = list.id === activeId;

          if (editing === list.id) {
            return (
              <NameEditor
                key={list.id}
                value={draft}
                busy={busy}
                onChange={setDraft}
                onSubmit={() => void submit()}
                onCancel={() => { setEditing(null); setError(null); }}
                label="Rename list"
              />
            );
          }

          return (
            <div
              key={list.id}
              className={cn(
                'group flex items-center rounded-[var(--radius-control)] border transition-colors',
                active
                  ? 'border-[var(--accent)] bg-[var(--surface)]'
                  : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]',
              )}
            >
              <a
                href={`/investing/watchlist?list=${encodeURIComponent(list.id)}`}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-1.5 py-1.5 pl-3 pr-2 text-sm font-medium"
              >
                {list.name}
                <span className="tabular text-2xs text-[var(--text-subtle)]">{list.count}</span>
              </a>
              {active ? (
                <span className="flex items-center gap-0.5 pr-1.5">
                  <button
                    type="button"
                    onClick={() => { setEditing(list.id); setDraft(list.name); setError(null); }}
                    aria-label={`Rename ${list.name}`}
                    className="grid h-6 w-6 place-items-center rounded text-[var(--text-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {lists.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => void remove(list.id, list.name)}
                      aria-label={`Delete ${list.name}`}
                      className="grid h-6 w-6 place-items-center rounded text-[var(--text-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--negative)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
          );
        })}

        {editing === 'new' ? (
          <NameEditor
            value={draft}
            busy={busy}
            onChange={setDraft}
            onSubmit={() => void submit()}
            onCancel={() => { setEditing(null); setError(null); }}
            label="New list name"
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setEditing('new'); setDraft(''); setError(null); }}
          >
            <Plus className="h-3.5 w-3.5" />
            New list
          </Button>
        )}
      </div>

      {error ? <p role="alert" className="mt-2 text-sm text-[var(--negative)]">{error}</p> : null}
    </div>
  );
}

function NameEditor({
  value, busy, onChange, onSubmit, onCancel, label,
}: {
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--accent)] bg-[var(--surface)] p-0.5 pl-1.5">
      <Input
        autoFocus
        value={value}
        aria-label={label}
        placeholder="Long term"
        maxLength={40}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="h-7 w-32 border-0 bg-transparent px-0 text-sm shadow-none focus:ring-0"
      />
      <button
        type="button" onClick={onSubmit} disabled={busy || value.trim() === ''} aria-label="Save"
        className="grid h-6 w-6 place-items-center rounded text-[var(--accent)] hover:bg-[var(--surface-2)] disabled:opacity-40"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button" onClick={onCancel} aria-label="Cancel"
        className="grid h-6 w-6 place-items-center rounded text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

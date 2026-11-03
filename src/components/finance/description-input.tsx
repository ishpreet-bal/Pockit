'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/primitives';
import { cn } from '@/lib/ui/cn';

export interface Suggestion {
  description: string;
  categoryId: string | null;
  uses: number;
}

/**
 * The "what was it?" box, with what you have typed before.
 *
 * A plain <datalist> would have been less code, but it cannot show the category
 * beside each option, cannot be styled, and behaves differently in every browser.
 * Choosing a suggestion here fills the category too, which is the actual saving —
 * the typing was never the slow part.
 *
 * Suggestions come from this workspace only. Nothing is shared between accounts.
 */
export function DescriptionInput({
  name, placeholder, onPick, className, ...rest
}: {
  name: string;
  placeholder?: string;
  /** Called with the category that description usually gets, when there is one. */
  onPick?: (suggestion: Suggestion) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onSelect'>) {
  const [value, setValue] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  /** Guards against an older response overwriting a newer one. */
  const seq = useRef(0);
  const suggestionsId = useId();

  useEffect(() => {
    const mine = ++seq.current;
    const text = value.trim();
    if (text.length < 1) { setItems([]); setActive(-1); return; }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/transactions/suggest?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        if (!response.ok) return;
        const json = (await response.json()) as { suggestions: Suggestion[] };
        // A slow earlier keystroke must not replace what a later one already found.
        if (mine !== seq.current || controller.signal.aborted) return;
        setItems(json.suggestions.filter((s) => s.description.toLowerCase() !== text.toLowerCase()));
        setActive(-1);
      } catch { /* typing still works without suggestions */ }
    }, 160);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [value]);

  useEffect(() => {
    function away(event: MouseEvent) {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  function choose(item: Suggestion) {
    setValue(item.description);
    setOpen(false);
    setItems([]);
    onPick?.(item);
  }

  const showing = open && items.length > 0;

  return (
    <div ref={wrap} className="relative">
      <Input
        {...rest}
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showing}
        aria-autocomplete="list"
        aria-controls={suggestionsId}
        aria-activedescendant={showing && active >= 0 ? `${suggestionsId}-${active}` : undefined}
        className={className}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showing) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          if (e.key === 'Enter' && active >= 0) {
            // Only swallow Enter when something is highlighted; otherwise it must
            // still submit the form, which is how most people finish this field.
            e.preventDefault();
            const item = items[active];
            if (item) choose(item);
          }
        }}
      />

      {showing ? (
        <ul
          role="listbox"
          id={suggestionsId}
          aria-label="Previous transaction descriptions"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)]"
        >
          {items.map((item, index) => (
            <li key={`${item.description}-${index}`}>
              <button
                type="button"
                role="option"
                id={`${suggestionsId}-${index}`}
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
                className={cn(
                  'flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm',
                  index === active ? 'bg-[var(--surface-2)]' : '',
                )}
              >
                <span className="truncate">{highlight(item.description, value.trim())}</span>
                <span className="shrink-0 text-2xs text-[var(--text-subtle)]">
                  {item.uses}×
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Bold the part they typed, so it is obvious why each row is being offered. */
function highlight(text: string, query: string): React.ReactNode {
  if (query === '') return text;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold text-[var(--accent)]">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}

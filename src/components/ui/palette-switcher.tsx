'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Palette, X, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

/**
 * A temporary control for choosing the app's visual identity on real data.
 *
 * Judging a palette from hex codes does not work — a colour that looks confident in
 * a swatch can look sickly behind an actual balance. This flips the whole app
 * between the three candidates in place, so the decision gets made against real
 * numbers on real screens.
 *
 * This is scaffolding. Once a palette is chosen it and its route get deleted, and
 * the winner moves into palettes.css as the only definition.
 */

export const PALETTES = [
  {
    id: 'ink',
    name: 'Ink & Chartreuse',
    blurb: 'Near-black on warm parchment, one acid accent',
    swatch: ['#f4f1ea', '#14120f', '#c3f53c'],
  },
  {
    id: 'midnight',
    name: 'Midnight & Copper',
    blurb: 'Dark-first, warm metal accents',
    swatch: ['#0e1116', '#ede8e0', '#d88c4a'],
  },
  {
    id: 'plum',
    name: 'Paper & Plum',
    blurb: 'Soft paper, deep plum, apricot highlight',
    swatch: ['#fbf8f6', '#241b26', '#6b2d5b'],
  },
] as const;

export type PaletteId = (typeof PALETTES)[number]['id'];

const KEY = 'pockit-palette';

export function applyPalette(id: PaletteId) {
  document.documentElement.setAttribute('data-palette', id);
  try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
}

export function usePalette(): [PaletteId, (id: PaletteId) => void] {
  const [palette, setPalette] = useState<PaletteId>('ink');

  // After mount, not during render: the server has no localStorage, and reading it
  // in the initial state would hydrate a different value than the server rendered.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored && PALETTES.some((p) => p.id === stored)) setPalette(stored as PaletteId);
    } catch { /* private mode */ }
  }, []);

  return [palette, (id) => { setPalette(id); applyPalette(id); }];
}

export function PaletteSwitcher() {
  const [palette, setPalette] = usePalette();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light');
    try { setDismissed(sessionStorage.getItem('pockit-palette-bar') === 'off'); } catch { /* ignore */ }
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('pockit-theme', next); } catch { /* private mode */ }
  }

  function dismiss() {
    setDismissed(true);
    setOpen(false);
    try { sessionStorage.setItem('pockit-palette-bar', 'off'); } catch { /* ignore */ }
  }

  if (dismissed) return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-4 z-50 md:bottom-6">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mb-2 w-[260px] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-lg)]"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold">Try a look</p>
              <button
                type="button" onClick={dismiss} aria-label="Hide the palette switcher"
                className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPalette(p.id)}
                  aria-pressed={palette === p.id}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[var(--radius-control)] border p-2 text-left transition-colors',
                    palette === p.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span aria-hidden className="flex shrink-0 overflow-hidden rounded-md border border-[var(--border)]">
                    {p.swatch.map((c) => (
                      <span key={c} className="h-6 w-3" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{p.name}</span>
                    <span className="block truncate text-2xs text-[var(--text-muted)]">{p.blurb}</span>
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--surface-2)] py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-3)]"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              View in {theme === 'dark' ? 'light' : 'dark'}
            </button>

            <p className="mt-2 text-2xs leading-relaxed text-[var(--text-subtle)]">
              Temporary. Tell me which one and I&rsquo;ll make it the app&rsquo;s only palette and
              remove this.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold shadow-[var(--shadow-md)] transition-transform hover:scale-105"
      >
        <Palette className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.1} />
        Try a look
      </button>
    </div>
  );
}

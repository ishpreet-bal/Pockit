'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Mascot, type Mood } from './mascot';
import { cn } from '@/lib/ui/cn';

export interface CompanionTip {
  /** Stable id, so a dismissed tip stays dismissed. */
  id: string;
  mood: Mood;
  text: string;
  action?: { href: string; label: string };
}

/**
 * Pock, on every screen.
 *
 * Two rules keep a permanent character from becoming the thing people mute:
 *
 *  - It never opens itself. The bubble appears only when tapped, so the character
 *    cannot talk over the number you came to read.
 *  - Its mood is derived from your actual position, not from a timer. A character
 *    that looks worried at random is noise; one that looks worried exactly when you
 *    are heading for a shortfall is a signal worth glancing at.
 *
 * Dismissing a tip hides that tip for good, and dismissing the character hides it
 * for the session. Both are remembered, because a guide you cannot turn off is not
 * a guide.
 */
export function Companion({ tip }: { tip: CompanionTip | null }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Rendered hidden on the server and revealed after mount, so the stored
  // preferences decide what appears rather than a flash of the default.
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem('pockit-companion') === 'off');
      setDismissedIds(JSON.parse(localStorage.getItem('pockit-tips-dismissed') ?? '[]') as string[]);
    } catch {
      setHidden(false);
    }
  }, []);

  function dismissTip() {
    if (!tip) return;
    const next = [...dismissedIds, tip.id];
    setDismissedIds(next);
    setOpen(false);
    try { localStorage.setItem('pockit-tips-dismissed', JSON.stringify(next.slice(-50))); } catch { /* private mode */ }
  }

  function hideCompanion() {
    setHidden(true);
    setOpen(false);
    try { sessionStorage.setItem('pockit-companion', 'off'); } catch { /* private mode */ }
  }

  if (hidden) return null;

  const activeTip = tip && !dismissedIds.includes(tip.id) ? tip : null;
  const mood: Mood = activeTip?.mood ?? 'idle';

  return (
    <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-4 z-40 md:bottom-6">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto mb-2 w-[min(280px,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm leading-relaxed">
                {activeTip?.text ?? 'Nothing needs you right now. Everything is where you left it.'}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {activeTip?.action ? (
              <Link
                href={activeTip.action.href}
                onClick={() => setOpen(false)}
                className="mt-2 inline-block text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                {activeTip.action.label} →
              </Link>
            ) : null}

            <div className="mt-2.5 flex gap-3 border-t border-[var(--border)] pt-2 text-2xs text-[var(--text-subtle)]">
              {activeTip ? (
                <button type="button" onClick={dismissTip} className="hover:text-[var(--text)]">
                  Don&rsquo;t show this again
                </button>
              ) : null}
              <button type="button" onClick={hideCompanion} className="hover:text-[var(--text)]">
                Hide Pock
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={activeTip ? 'Pock has something to say' : 'Pock'}
        className={cn(
          'pointer-events-auto relative grid h-12 w-12 place-items-center rounded-full',
          'bg-[var(--accent-fill)] text-[var(--accent-fill-fg)] shadow-[var(--shadow-md)]',
          'transition-transform hover:scale-105 active:scale-95',
        )}
      >
        <Mascot mood={mood} className="h-8 w-8" />
        {activeTip && !open ? (
          // One quiet dot, not a bouncing badge. It says "there is something here"
          // without demanding the screen.
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-[var(--negative)]"
          />
        ) : null}
      </button>
    </div>
  );
}

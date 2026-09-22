'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { X, MessageCircleQuestion, MessageSquarePlus, Compass, PlayCircle, Sparkles } from 'lucide-react';
import { Mascot, type Mood } from './mascot';
import { AskPock, type PockAnchor } from './ask-pock';
import { FeedbackForm } from '@/components/feedback/feedback-form';
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
  /** Which panel is showing: the tip bubble, the assistant, or the feedback form. */
  const [panel, setPanel] = useState<'tip' | 'ask' | 'feedback'>('tip');
  /** Set by an "Ask Pock about this…" button elsewhere on the page. */
  const [ask, setAsk] = useState<{ anchor: PockAnchor | null; prompt?: string }>({ anchor: null });

  // Pock travels with you: each time the page changes it does a small swim-hop and
  // looks pleased for a moment. Once per navigation, never on a timer — a
  // character that fidgets on its own is the thing people reach to mute.
  const pathname = usePathname();
  const controls = useAnimationControls();
  const reduced = useReducedMotion();
  const [greeting, setGreeting] = useState(false);
  useEffect(() => {
    if (reduced) return;
    setGreeting(true);
    void controls.start({
      y: [0, -14, 0, -4, 0],
      rotate: [0, -12, 8, -3, 0],
      transition: { duration: 0.9, ease: 'easeOut' },
    });
    const t = setTimeout(() => setGreeting(false), 1400);
    return () => clearTimeout(t);
  }, [pathname, controls, reduced]);
  const [hidden, setHidden] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Rendered hidden on the server and revealed after mount, so the stored
  // preferences decide what appears rather than a flash of the default.
  // Contextual "Ask Pock about this goal" buttons open the panel here, carrying
  // their subject. An event rather than a route, so the person stays on the page
  // they were reading.
  useEffect(() => {
    function onAsk(event: Event) {
      const detail = (event as CustomEvent<{ anchor: PockAnchor; prompt?: string }>).detail;
      setAsk({ anchor: detail?.anchor ?? null, prompt: detail?.prompt });
      setHidden(false);
      setPanel('ask');
      setOpen(true);
    }
    window.addEventListener('pock:ask', onAsk);
    return () => window.removeEventListener('pock:ask', onAsk);
  }, []);

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

  function close() {
    setOpen(false);
    setAsk({ anchor: null });
    // Back to the bubble, so the next tap is the small thing rather than resuming a
    // conversation the person had already finished with.
    setPanel('tip');
  }

  function hideCompanion() {
    setHidden(true);
    setOpen(false);
    try { sessionStorage.setItem('pockit-companion', 'off'); } catch { /* private mode */ }
  }

  if (hidden) return null;

  const activeTip = tip && !dismissedIds.includes(tip.id) ? tip : null;
  const mood: Mood = greeting ? 'happy' : activeTip?.mood ?? 'idle';

  return (
    // Stacked above the quick-add button rather than bottom-left: the sidebar's
    // own footer lives in that corner on desktop, and a character sitting on top of
    // the theme switcher is not a guide, it is an obstruction.
    <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+136px)] right-4 z-40 flex flex-col items-end md:bottom-24 md:right-6">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'pointer-events-auto mb-2 origin-bottom-right overflow-hidden rounded-[var(--radius-card)]',
              'border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]',
              panel === 'tip'
                ? 'w-[min(280px,calc(100vw-2rem))] p-3.5'
                : 'flex h-[min(560px,calc(100vh-13rem))] w-[min(380px,calc(100vw-2rem))] flex-col',
            )}
          >
            {panel === 'ask' ? (
              <AskPock
                key={`${ask.anchor?.kind ?? 'none'}:${ask.anchor?.id ?? ''}`}
                anchor={ask.anchor}
                initialPrompt={ask.prompt}
                onClose={close}
              />
            ) : panel === 'feedback' ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
                  <h2 className="flex-1 text-sm font-semibold">Tell us what is wrong</h2>
                  <button
                    type="button" onClick={close} aria-label="Close"
                    className="grid h-7 w-7 place-items-center rounded text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <FeedbackForm onDone={close} />
                </div>
              </div>
            ) : (
            <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm leading-relaxed">
                {activeTip?.text ?? 'Nothing needs you right now. Everything is where you left it.'}
              </p>
              <button
                type="button"
                onClick={close}
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

            {/* The two things people actually want from a character in the corner:
                somewhere to ask, and somewhere to complain. */}
            <div className="mt-2.5 space-y-1 border-t border-[var(--border)] pt-2">
              <button
                type="button"
                onClick={() => setPanel('ask')}
                className="flex w-full items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm font-medium text-[var(--accent)] hover:bg-[var(--surface-2)]"
              >
                <MessageCircleQuestion className="h-4 w-4" />
                Confused? Ask Pock
              </button>
              <button
                type="button"
                onClick={() => { close(); window.dispatchEvent(new Event('pock:explore')); }}
                className="flex w-full items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <Compass className="h-4 w-4 text-[var(--text-subtle)]" />
                Explore this page
              </button>
              <button
                type="button"
                onClick={() => { close(); window.dispatchEvent(new Event('pock:tour')); }}
                className="flex w-full items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <PlayCircle className="h-4 w-4 text-[var(--text-subtle)]" />
                Replay the 60-second tour
              </button>
              <a
                href="/demo"
                className="flex w-full items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <Sparkles className="h-4 w-4 text-[var(--text-subtle)]" />
                Still confused? Try the demo
              </a>
              <button
                type="button"
                onClick={() => setPanel('feedback')}
                className="flex w-full items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <MessageSquarePlus className="h-4 w-4 text-[var(--text-subtle)]" />
                Don&rsquo;t like something?
              </button>
            </div>

            <div className="mt-2 flex gap-3 border-t border-[var(--border)] pt-2 text-2xs text-[var(--text-subtle)]">
              {activeTip ? (
                <button type="button" onClick={dismissTip} className="hover:text-[var(--text)]">
                  Don&rsquo;t show this again
                </button>
              ) : null}
              <button type="button" onClick={hideCompanion} className="hover:text-[var(--text)]">
                Hide Pock
              </button>
            </div>
            </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        animate={controls}
        whileHover={reduced ? undefined : { scale: 1.08, rotate: -6 }}
        whileTap={reduced ? undefined : { scale: 0.94 }}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-tour="pock"
        aria-label={activeTip ? 'Pock has something to say' : 'Pock'}
        className={cn(
          'pointer-events-auto relative grid h-14 w-14 place-items-center rounded-full',
          // A little pool for the otter to float in, rather than a flat brand disc.
          'bg-[radial-gradient(circle_at_50%_70%,color-mix(in_srgb,var(--goal)_35%,var(--surface))_0%,var(--surface)_70%)]',
          'border border-[var(--border-strong)] shadow-[var(--shadow-md)]',
        )}
      >
        <Mascot mood={mood} className="h-12 w-12" />
        {activeTip && !open ? (
          // One quiet dot, not a bouncing badge. It says "there is something here"
          // without demanding the screen.
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-[var(--negative)]"
          />
        ) : null}
      </motion.button>
    </div>
  );
}

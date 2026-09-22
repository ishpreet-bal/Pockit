'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/primitives';
import { Mascot } from '@/components/brand/mascot';

export interface TourStep {
  /**
   * A selector for the real element this step is about. Omitted for a centred
   * step — an introduction or a closing word that is about the page as a whole.
   */
  target?: string;
  title: string;
  body: string;
  /** Where the card sits relative to the target when there is room. */
  prefer?: 'bottom' | 'top' | 'right' | 'left';
}

interface Box { top: number; left: number; width: number; height: number }

/**
 * The VISIBLE element for a selector.
 *
 * The navigation exists twice in the DOM: a sidebar hidden below `md`, and a tab
 * bar hidden above it. Both carry the same `data-tour` hook, and `querySelector`
 * returns the first match regardless of whether it is displayed — so on a phone the
 * tour measured the hidden sidebar, got a zero-sized rectangle, and parked its card
 * in the top-left corner while the real tab bar sat untouched at the bottom.
 *
 * Zero-sized means hidden, for every way of hiding something that matters here.
 */
function visible(selector: string): Element | null {
  for (const element of document.querySelectorAll(selector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

/**
 * The guided tour.
 *
 * Built around one rule: the spotlight sits on the REAL element, measured from the
 * live DOM. A tour drawn from hard-coded coordinates drifts the moment anything
 * moves, and drifts differently at every screen size — which is how tours end up
 * pointing at empty space on a phone.
 *
 * Each step measures its target, scrolls it into view, and animates the cut-out to
 * it. A step whose target does not exist on this viewport — the sidebar is not
 * rendered on a phone — is skipped rather than pointed at nothing.
 */
export function Tour({
  steps, onFinish,
}: { steps: TourStep[]; onFinish: (completed: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const measure = useCallback(() => {
    const step = steps[index];
    if (!step) return;
    const element = step.target ? visible(step.target) : null;
    if (!element) { setBox(null); return; }
    const rect = element.getBoundingClientRect();
    setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, [index, steps]);

  useEffect(() => {
    const step = steps[index];
    if (!step) return;
    if (!step.target) { setBox(null); return; }
    const element = visible(step.target);
    if (!element) {
      // Skip past a target this viewport does not show, rather than anchoring a
      // card to the corner of the screen.
      let nextReal = -1;
      for (let i = index + 1; i < steps.length; i++) {
        const t = steps[i]!.target;
        if (!t || visible(t)) { nextReal = i; break; }
      }
      if (nextReal === -1) onFinish(true);
      else setIndex(nextReal);
      return;
    }
    element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    // Measured after the scroll settles, or the cut-out lands where the element was.
    const timer = setTimeout(measure, reduced ? 0 : 320);
    return () => clearTimeout(timer);
  }, [index, steps, measure, reduced, onFinish]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  useEffect(() => {
    cardRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onFinish(false);
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [steps.length, onFinish]);

  if (!mounted) return null;
  const step = steps[index];
  if (!step) return null;

  const pad = 8;
  const cut = box
    ? { top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }
    : null;

  // A step with no target is an introduction: centred, over an even dim.
  // Framer animates `y`, which would overwrite a translate() used for centring, so
  // a centred card is placed by a grid wrapper instead of by its own transform.
  const card: React.CSSProperties | undefined = cut ? placeCard(cut, step.prefer ?? 'bottom') : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={`Tour, step ${index + 1} of ${steps.length}`}
    >
      {/* Four panels rather than one overlay with a hole. An SVG mask or a very
          large spread shadow both intercept clicks across the whole screen, and the
          shadow repaints expensively on every scroll frame. */}
      {cut ? (
        <>
          <Shade reduced={reduced} style={{ top: 0, left: 0, right: 0, height: Math.max(0, cut.top) }} />
          <Shade reduced={reduced} style={{ top: cut.top + cut.height, left: 0, right: 0, bottom: 0 }} />
          <Shade reduced={reduced} style={{ top: cut.top, left: 0, width: Math.max(0, cut.left), height: cut.height }} />
          <Shade reduced={reduced} style={{ top: cut.top, left: cut.left + cut.width, right: 0, height: cut.height }} />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute rounded-[var(--radius-card)] ring-2 ring-[var(--accent)]"
            initial={false}
            animate={{ top: cut.top, left: cut.left, width: cut.width, height: cut.height }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
          />
        </>
      ) : (
        <Shade reduced={reduced} style={{ inset: 0 }} />
      )}

      <div className={cut ? 'contents' : 'absolute inset-0 grid place-items-center p-4'}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          ref={cardRef}
          tabIndex={-1}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={card}
          className={`${cut ? 'absolute' : 'relative'} w-[min(340px,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)] outline-none`}
        >
          {/* On a centred step Pock is the one speaking, so Pock is on the card. */}
          {!cut ? <Mascot mood="happy" className="mb-2 h-16 w-16" /> : null}
          <p className="text-2xs uppercase tracking-[0.08em] text-[var(--text-subtle)]">
            {index + 1} / {steps.length}
          </p>
          <h2 className="mt-1 text-base font-semibold">{step.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{step.body}</p>

          <div className="mt-3.5 flex items-center gap-2">
            {index > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))}>Back</Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              className="ml-auto"
              onClick={() => {
                if (index >= steps.length - 1) onFinish(true);
                else setIndex((i) => i + 1);
              }}
            >
              {index >= steps.length - 1 ? 'Done' : 'Next'}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => onFinish(false)}
            className="mt-2 w-full text-center text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
          >
            Skip tour
          </button>
        </motion.div>
      </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}

function Shade({ style, reduced }: { style: React.CSSProperties; reduced: boolean | null }) {
  return (
    <motion.div
      className="absolute bg-[rgba(0,0,0,0.55)]"
      style={style}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    />
  );
}

/**
 * Where the card goes.
 *
 * Preference first, then whatever fits. On a phone almost nothing fits beside the
 * target, so it falls back to below and then to clamped-on-screen — visible beats
 * correctly-positioned-off-screen.
 */
function placeCard(cut: Box, prefer: 'bottom' | 'top' | 'right' | 'left'): React.CSSProperties {
  const CARD_W = Math.min(320, window.innerWidth - 32);
  const CARD_H = 210;
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const fits = {
    bottom: cut.top + cut.height + gap + CARD_H < vh,
    top: cut.top - gap - CARD_H > 0,
    right: cut.left + cut.width + gap + CARD_W < vw,
    left: cut.left - gap - CARD_W > 0,
  };

  const order: (keyof typeof fits)[] = [prefer, 'bottom', 'top', 'right', 'left'];
  const side = order.find((s) => fits[s]) ?? 'bottom';

  const clampX = (x: number) => Math.max(16, Math.min(x, vw - CARD_W - 16));
  const clampY = (y: number) => Math.max(16, Math.min(y, vh - CARD_H - 16));

  switch (side) {
    case 'top': return { top: clampY(cut.top - gap - CARD_H), left: clampX(cut.left) };
    case 'right': return { top: clampY(cut.top), left: clampX(cut.left + cut.width + gap) };
    case 'left': return { top: clampY(cut.top), left: clampX(cut.left - gap - CARD_W) };
    default: return { top: clampY(cut.top + cut.height + gap), left: clampX(cut.left) };
  }
}

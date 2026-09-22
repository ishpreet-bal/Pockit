'use client';

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * The app's motion vocabulary, in one file.
 *
 * Every animation here is short, spatially small and tied to a real change of state.
 * Motion earns its place by telling you where something came from or that a number
 * just changed — never by decorating a page that is simply sitting there.
 *
 * `useReducedMotion` is honoured in every component rather than only in CSS, because
 * Framer animates via style properties that a `prefers-reduced-motion` media query
 * cannot reach. With it on, everything below renders its final state immediately.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------------- Animated numbers ---------------- */

/**
 * Counts to a value rather than snapping to it.
 *
 * Money is the one thing on this page people actually read, so the count is short
 * (under half a second) and eased hard out: long enough to notice the change, not so
 * long that you sit waiting to learn your balance. The element reserves its final
 * width via tabular figures so the layout never reflows mid-count.
 *
 * `format` receives the interpolated MAJOR-unit value. Callers pass their own
 * formatter so this component never has to know about currencies or minor units.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  durationMs = 420,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  durationMs?: number;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutExpo: nearly all of the movement happens up front, so the number
      // settles on its final digits early instead of crawling the last few cents.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs, reduced]);

  return <span className={cn('tabular', className)}>{format(display)}</span>;
}

/* ---------------- Entrance ---------------- */

/** A single element easing up into place. */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

const STAGGER_PARENT: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const STAGGER_CHILD: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
};

/**
 * Reveals children one after another.
 *
 * Used for card grids and lists, where arriving all at once reads as a flash and
 * arriving in sequence reads as the page assembling itself. The stagger is 50ms —
 * enough to perceive order, short enough that a six-card grid is done in 300ms.
 */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={STAGGER_PARENT} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={STAGGER_CHILD}>
      {children}
    </motion.div>
  );
}

/* ---------------- Multi-step flows ---------------- */

/**
 * Directional slide between wizard steps.
 *
 * `direction` is +1 going forward and -1 going back, so the content moves the way the
 * person just asked it to: Next pushes the old step out to the left, Back brings it
 * back from the left. Getting this backwards is worse than no animation at all,
 * because it implies you moved the wrong way.
 *
 * `mode="wait"` matters here — overlapping two full-width steps would make the form
 * jump in height mid-transition.
 */
export function StepTransition({
  stepKey,
  direction,
  children,
}: {
  stepKey: string | number;
  direction: 1 | -1;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div>{children}</div>;
  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        initial={{ opacity: 0, x: direction * 40, filter: 'blur(6px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, x: direction * -40, filter: 'blur(6px)' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------------- Overlays ---------------- */

/**
 * A drawer on phones and a centred dialog on wider screens, from one component.
 *
 * The two share state and content and differ only in where they come from, which is
 * why they are one component: a separate mobile sheet would inevitably drift from
 * its desktop twin.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  // Escape closes, and the page behind must not scroll while a sheet is over it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'relative z-10 max-h-[90dvh] w-full overflow-y-auto bg-[var(--surface)] shadow-[var(--shadow-lg)]',
              'rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]',
              'sm:max-w-md sm:rounded-2xl sm:pb-0',
            )}
            initial={reduced ? false : { y: '100%', opacity: 0.6, scale: 1 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ---------------- Interaction ---------------- */

/**
 * The hover-lift used by every clickable card.
 *
 * Kept as a class string rather than a component so it composes onto links, buttons
 * and article elements alike without wrapping any of them in an extra div.
 */
export const HOVER_LIFT =
  'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] active:translate-y-0 active:shadow-[var(--shadow-sm)]';

/** A quiet pulse for a badge that wants noticing without raising an alarm. */
export const SOFT_PULSE = 'motion-safe:animate-[pk-pulse-soft_2.4s_ease-in-out_infinite]';

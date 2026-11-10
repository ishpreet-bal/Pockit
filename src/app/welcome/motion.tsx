'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** True once the element has scrolled into view (and stays true). */
function useSeen<T extends Element>(margin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

/**
 * Rises gently into place the first time it scrolls into view. Children marked
 * with `data-stagger` follow one after another. Everything is plain CSS
 * (globals.css .pk-reveal), so reduced-motion settings switch it off.
 */
export function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'section' | 'article' | 'li' | 'ol' | 'ul' }) {
  const [ref, seen] = useSeen<HTMLElement>();
  return (
    <Tag ref={ref as never} className={`pk-reveal ${seen ? 'pk-in' : ''} ${className}`} style={{ '--pk-delay': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** A money figure that counts up when it comes into view. */
export function CountUp({ to, prefix = '$', className = '' }: { to: number; prefix?: string; className?: string }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (!seen) { setValue(0); return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setValue(to); return; }
    const start = performance.now();
    const ms = 1100;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to]);
  return <span ref={ref} className={`tabular-nums ${className}`} aria-label={`${prefix}${to.toLocaleString('en-CA')}`}>{prefix}{value.toLocaleString('en-CA')}</span>;
}

/** Rows that light up one after another when the list comes into view (the payday runway). */
export function Sequence({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [ref, seen] = useSeen<HTMLOListElement>();
  return <ol ref={ref} className={`pk-seq ${seen ? 'pk-in' : ''} ${className}`}>{children}</ol>;
}

/** Follows the pointer with a slight tilt, so the phone feels like an object on the desk. */
export function Tilt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || window.matchMedia?.('(pointer: coarse)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
        const y = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
        el.style.setProperty('--pk-rx', `${(-y * 6).toFixed(2)}deg`);
        el.style.setProperty('--pk-ry', `${(x * 8).toFixed(2)}deg`);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return <div ref={ref} className="pk-tilt">{children}</div>;
}

'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Every tab, in a phone that moves through them on its own: real screens from the
 * app (sample money), each sliding into the next the way the app itself moves.
 * Tap a tab to go straight to it. Pauses off screen; with reduced motion it just
 * swaps screens.
 */

const TABS = [
  { key: 'home', label: 'Home', hue: 'coral', title: 'What you can spend today', body: 'Your money minus every bill before payday, as one number, and a countdown that shows what’s left after each bill.' },
  { key: 'spending', label: 'Spending', hue: 'sky', title: 'Where it went, sorted for you', body: 'Your bank’s purchases arrive by themselves, sorted into categories. Fix one and every purchase from that shop follows.' },
  { key: 'pock', label: 'Ask Pock', hue: 'violet', title: 'Pock, who knows your numbers', body: 'Ask anything about your money in plain words. Tell Pock what you spent and it gets it ready for one tap.' },
  { key: 'goals', label: 'Goals', hue: 'leaf', title: 'Save for the things that matter', body: 'A trip, a car, a cushion. See how far along you are and what it takes each payday.' },
  { key: 'together', label: 'Together', hue: 'gold', title: 'Money you share with people', body: 'Who owes who, both ways, and shared spaces for a partner or roommates. Your own money stays your own.' },
] as const;

const DWELL = 5200;

export function TabTour() {
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = (i: number) => { if (i === active) return; setPrev(active); setActive(i); };

  useEffect(() => {
    if (!visible || paused) return;
    const t = setTimeout(() => go((active + 1) % TABS.length), DWELL);
    return () => clearTimeout(t);
  });

  const tab = TABS[active]!;
  return (
    <div ref={ref} className="grid items-center gap-10 md:grid-cols-[1fr_auto]" onPointerEnter={(e) => { if (e.pointerType === 'mouse') setPaused(true); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setPaused(false); }}>
      <ol className="order-2 space-y-2 md:order-1">
        {TABS.map((t, i) => {
          const on = i === active;
          return (
            <li key={t.key}>
              <button type="button" onClick={() => go(i)} aria-pressed={on}
                className={`pk-hue-${t.hue} group relative w-full overflow-hidden rounded-[18px] border p-4 text-left transition-all duration-300 ${on ? 'border-transparent bg-[var(--surface)] shadow-[var(--shadow-md)]' : 'border-transparent hover:bg-[var(--surface)]'}`}>
                <span className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-sm font-bold transition-colors" style={{ background: on ? 'var(--hue-fill)' : 'var(--hue-soft)', color: on ? '#fff' : 'var(--hue)' }}>{i + 1}</span>
                  <span className="min-w-0">
                    <span className={`block font-semibold ${on ? '' : 'text-[var(--text-muted)]'}`}>{t.label}</span>
                    {on ? <span className="block text-sm text-[var(--text-muted)]">{t.title}</span> : null}
                  </span>
                </span>
                {on ? <span className="mt-2 block pl-12 text-sm leading-relaxed text-[var(--text-muted)] pk-fade-in">{t.body}</span> : null}
                {on && visible && !paused ? <span key={`bar-${active}`} className="pk-progress absolute bottom-0 left-0 h-[3px]" style={{ background: 'var(--hue)', animationDuration: `${DWELL}ms` }} /> : null}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="order-1 mx-auto md:order-2">
        <div className={`pk-hue-${tab.hue} relative rounded-[46px] p-[10px] transition-[box-shadow] duration-700`} style={{ background: '#1b1a19', boxShadow: '0 30px 80px -30px var(--hue), 0 12px 30px -12px rgba(0,0,0,0.35)' }}>
          <div className="relative h-[560px] w-[260px] overflow-hidden rounded-[37px] bg-[var(--bg)] sm:h-[600px] sm:w-[278px]">
            {TABS.map((t, i) => {
              const state = i === active ? 'pk-screen-in' : i === prev ? 'pk-screen-out' : 'pk-screen-hidden';
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={t.key} src={`/welcome/tab-${t.key}.jpg`} alt={i === active ? `Pockit's ${t.label} tab` : ''} aria-hidden={i !== active}
                  loading={i === 0 ? 'eager' : 'lazy'} className={`pk-screen absolute inset-0 h-full w-full object-cover object-top ${state}`} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

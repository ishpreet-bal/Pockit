'use client';

import { useEffect, useRef, useState } from 'react';
import { PockMark } from '@/components/brand/pock-mark';

/**
 * Meet Pock: a conversation that plays by itself. Someone tells Pock something,
 * Pock offers to do it, the button gets tapped, and the little app beside it
 * changes. It shows what Pock is for faster than any paragraph could.
 *
 * Plays only while on screen, pauses on hover, and with reduced motion shows each
 * scene finished instead of typing it out. The figures are made up for the demo.
 */

type Hue = 'coral' | 'sky' | 'leaf' | 'violet';
interface Scene {
  key: string; chip: string; hue: Hue;
  ask: string; reply: string;
  card: { title: string; detail: string; button: string } | null;
}

const SCENES: Scene[] = [
  { key: 'spend', chip: 'Add a purchase', hue: 'coral', ask: 'Just grabbed lunch, $18.40 at Freshii', reply: 'Got it. Tap Add it and it’s saved.', card: { title: 'Add $18.40 at Freshii', detail: 'Takeaway · Chequing · today', button: 'Add it' } },
  { key: 'budget', chip: 'Set a budget', hue: 'leaf', ask: 'Can you keep eating out under $200 a month?', reply: 'Here’s the budget. I’ll tell you at 80% and if it goes over.', card: { title: 'Budget $200 a month for Restaurants', detail: '$142 spent so far this month', button: 'Set budget' } },
  { key: 'card', chip: 'Card due date', hue: 'sky', ask: 'When is my Amex due?', reply: 'Friday, Nov 21. Statement is $588.12, minimum $25. I’ll remind you 3 days before.', card: null },
  { key: 'split', chip: 'Split dinner', hue: 'violet', ask: 'Dinner was $96 for 4 of us, I paid', reply: 'Only your $24 counts as spending. The other $72 is coming back to you.', card: { title: 'Split $96 four ways', detail: 'Sam, Priya and Jordan owe you $24 each', button: 'Split it' } },
];

/** Steps within a scene: 0 nothing, 1 typing the question, 2 asked, 3 Pock thinking, 4 reply, 5 button pressed, 6 done. */
const TIMING = [400, 1500, 700, 1100, 1300, 600, 3200];

export function MeetPock() {
  const [scene, setScene] = useState(0);
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const s = SCENES[scene]!;

  useEffect(() => {
    setStill(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // With reduced motion, every scene is shown finished.
  useEffect(() => { if (still) { setStep(6); setTyped(s.ask.length); } }, [still, scene, s.ask.length]);

  useEffect(() => {
    if (still || paused || !visible) return;
    if (step === 1 && typed < s.ask.length) {
      const t = setTimeout(() => setTyped((n) => Math.min(s.ask.length, n + 2)), 38);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (step === 4 && !s.card) { setStep(6); return; }
      if (step >= 6) { setScene((x) => (x + 1) % SCENES.length); setStep(0); setTyped(0); return; }
      setStep(step + 1);
    }, TIMING[step]);
    return () => clearTimeout(t);
  }, [step, typed, paused, visible, still, s]);

  const jump = (i: number) => { setScene(i); setStep(still ? 6 : 1); setTyped(still ? SCENES[i]!.ask.length : 0); };

  return (
    <div ref={ref} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="grid items-stretch gap-5 md:grid-cols-[1.15fr_0.85fr]">
      {/* The conversation */}
      <div className="flex min-h-[420px] flex-col rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><PockMark className="h-6 w-6" /></span>
          <div>
            <p className="font-semibold leading-tight">Pock</p>
            <p className="text-xs text-[var(--text-muted)]">Knows your money. Asks before changing anything.</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-subtle)]"><span className="h-2 w-2 rounded-full bg-[var(--positive)]" />here</span>
        </div>

        <div className="flex flex-1 flex-col justify-end gap-3 px-5 py-5" aria-live="polite">
          {step >= 1 ? (
            <div className="pk-bubble ml-auto max-w-[85%] rounded-[18px] rounded-br-[6px] bg-[var(--accent-fill)] px-4 py-2.5 text-[var(--accent-fill-fg)]">
              {s.ask.slice(0, step === 1 ? typed : s.ask.length)}{step === 1 ? <span className="pk-caret" /> : null}
            </div>
          ) : null}
          {step === 3 ? (
            <div className="pk-bubble flex w-16 items-center justify-center gap-1 rounded-[18px] rounded-bl-[6px] border border-[var(--border)] bg-[var(--bg)] py-3" aria-label="Pock is thinking">
              <span className="pk-dot-typing" /><span className="pk-dot-typing" style={{ animationDelay: '120ms' }} /><span className="pk-dot-typing" style={{ animationDelay: '240ms' }} />
            </div>
          ) : null}
          {step >= 4 ? (
            <div className="pk-bubble max-w-[88%] rounded-[18px] rounded-bl-[6px] border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
              <p>{s.reply}</p>
              {s.card ? (
                <div className={`pk-hue-${s.hue} mt-3 rounded-[14px] p-3`} style={{ background: 'var(--hue-soft)' }}>
                  <p className="text-sm font-semibold">{s.card.title}</p>
                  <p className="text-xs text-[var(--text-muted)]">{s.card.detail}</p>
                  <div className="mt-2.5 flex items-center gap-3">
                    {step >= 6 ? (
                      <span className="pk-pop inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--hue)' }}>✓ Done</span>
                    ) : (
                      <span className={`inline-flex rounded-full px-4 py-1.5 text-sm font-semibold text-white transition-transform duration-200 ${step === 5 ? 'scale-90 ring-4 ring-[var(--hue-soft)]' : ''}`} style={{ background: 'var(--hue-fill)' }}>{s.card.button}</span>
                    )}
                    {step < 6 ? <span className="text-sm font-semibold text-[var(--text-muted)]">Not now</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] px-5 py-4">
          {SCENES.map((x, i) => (
            <button key={x.key} type="button" onClick={() => jump(i)} aria-pressed={i === scene}
              className={`pk-press pk-hue-${x.hue} rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${i === scene ? 'border-transparent text-white' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}
              style={i === scene ? { background: 'var(--hue-fill)' } : undefined}>
              {x.chip}
            </button>
          ))}
        </div>
      </div>

      {/* The app, reacting */}
      <MiniApp scene={s.key} done={step >= 6} />
    </div>
  );
}

function MiniApp({ scene, done }: { scene: string; done: boolean }) {
  const spentLunch = scene === 'spend' && done;
  const safe = spentLunch ? 1561 : 1579;
  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow-md)]" aria-hidden>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">In the app</p>
      <div>
        <p className="pk-display text-4xl tabular-nums text-[var(--accent)] transition-all duration-500">${safe.toLocaleString('en-CA')}</p>
        <p className="text-sm text-[var(--text-muted)]">safe to spend · 4 days to payday</p>
      </div>

      <Panel active={scene === 'spend'} hue="coral" title="Today">
        {spentLunch ? <Row key="lunch" fresh label="Freshii" sub="Takeaway" value="−18.40" /> : null}
        <Row label="Tim Hortons" sub="Coffee" value="−4.25" />
        <Row label="Presto" sub="Transit" value="−3.35" />
      </Panel>

      <Panel active={scene === 'budget'} hue="leaf" title="Restaurants">
        {scene === 'budget' && done ? (
          <div className="pk-fade-in">
            <div className="flex justify-between text-sm"><span>$142 of $200</span><span className="text-[var(--text-muted)]">$58 left</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="pk-grow h-full rounded-full" style={{ width: '71%', background: 'var(--hue-leaf)' }} /></div>
          </div>
        ) : <p className="text-sm text-[var(--text-subtle)]">No budget yet</p>}
      </Panel>

      <Panel active={scene === 'card'} hue="sky" title="Card payments">
        <div className="flex items-center justify-between text-sm">
          <span>Amex Cobalt <span className="text-[var(--text-muted)]">· due Nov 21</span></span>
          <span className="font-semibold tabular-nums">$588.12</span>
        </div>
        {scene === 'card' && done ? <p className="pk-fade-in mt-1 text-xs font-semibold" style={{ color: 'var(--hue-sky)' }}>Reminder set for Nov 18</p> : null}
      </Panel>

      <Panel active={scene === 'split'} hue="violet" title="Together">
        <div className="flex items-center justify-between text-sm">
          <span>Coming back to you</span>
          <span className="font-semibold tabular-nums transition-all" style={{ color: scene === 'split' && done ? 'var(--hue-violet)' : undefined }}>{scene === 'split' && done ? '$72.00' : '$0.00'}</span>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ active, hue, title, children }: { active: boolean; hue: Hue; title: string; children: React.ReactNode }) {
  return (
    <div className={`pk-hue-${hue} rounded-[16px] border p-3 transition-all duration-500 ${active ? 'border-[var(--hue)] shadow-[0_0_0_4px_var(--hue-soft)]' : 'border-[var(--border)]'}`}>
      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--hue)' }} />{title}</p>
      {children}
    </div>
  );
}

function Row({ label, sub, value, fresh = false }: { label: string; sub: string; value: string; fresh?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${fresh ? 'pk-slide-in' : ''}`}>
      <span>{label} <span className="text-[var(--text-subtle)]">· {sub}</span></span>
      <span className="tabular-nums text-[var(--negative)]">{value}</span>
    </div>
  );
}

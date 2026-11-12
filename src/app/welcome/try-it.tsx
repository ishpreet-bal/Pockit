'use client';

import { useId, useState } from 'react';

/**
 * Two small things to play with before signing up: Pockit's main number worked out
 * from your own figures, and splitting a bill. Nothing typed here leaves the page.
 * One card with a switch rather than two side by side, so it stays calm to look at.
 */
export function TryIt() {
  const [tool, setTool] = useState<'spend' | 'split'>('spend');
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] sm:p-8">
      <div role="tablist" aria-label="Pick a tool" className="mx-auto flex w-full max-w-sm rounded-full bg-[var(--surface-2)] p-1">
        {([['spend', 'Safe to spend'], ['split', 'Split a bill']] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tool === key} onClick={() => setTool(key)}
            className={`pk-press flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tool === key ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
            {label}
          </button>
        ))}
      </div>
      <div key={tool} className="pk-fade-in mt-6">{tool === 'spend' ? <SafeToSpend /> : <SplitBill />}</div>
      <p className="mt-6 text-center text-xs text-[var(--text-subtle)]">Just a calculator. Nothing you enter here is saved or sent anywhere.</p>
    </div>
  );
}

const money = (n: number, cents = false) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

function SafeToSpend() {
  const [balance, setBalance] = useState(1800);
  const [bills, setBills] = useState(650);
  const [days, setDays] = useState(9);
  const left = balance - bills;
  const perDay = left > 0 ? Math.floor(left / days) : 0;
  const tone = left <= 0 ? 'text-[var(--negative)]' : perDay < 20 ? 'text-[var(--warning)]' : 'text-[var(--accent)]';
  const note = left <= 0
    ? 'Bills are more than what’s in the account. Pockit would flag this early, so there’s time to move money or call ahead.'
    : perDay < 20
      ? 'Tight, but you can see it coming. That’s the point: no surprises the day before payday.'
      : 'That’s yours to spend each day, after every bill before payday is covered.';
  return (
    <div className="grid items-center gap-8 md:grid-cols-[1fr_0.9fr]">
      <div className="space-y-6">
        <Slider label="In your chequing account" value={balance} min={0} max={6000} step={50} onChange={setBalance} format={(v) => money(v)} />
        <Slider label="Bills due before payday" value={bills} min={0} max={4000} step={25} onChange={setBills} format={(v) => money(v)} />
        <Slider label="Days until payday" value={days} min={1} max={31} step={1} onChange={setDays} format={(v) => `${v} day${v === 1 ? '' : 's'}`} />
      </div>
      <div className="rounded-[20px] bg-[var(--bg)] p-6 text-center" aria-live="polite">
        <p className="text-sm text-[var(--text-muted)]">Safe to spend each day</p>
        <p className={`pk-display mt-1 text-6xl tabular-nums transition-colors ${tone}`}>{money(perDay)}</p>
        <p className="mt-2 text-sm tabular-nums text-[var(--text-muted)]">{left > 0 ? `${money(left)} until payday` : `${money(Math.abs(left))} short`}</p>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">{note}</p>
      </div>
    </div>
  );
}

function SplitBill() {
  const [total, setTotal] = useState(120);
  const [people, setPeople] = useState(4);
  const [tip, setTip] = useState(15);
  const withTip = total * (1 + tip / 100);
  const each = Math.round((withTip / people) * 100) / 100;
  const back = Math.round(each * (people - 1) * 100) / 100;
  return (
    <div className="grid items-center gap-8 md:grid-cols-[1fr_0.9fr]">
      <div className="space-y-6">
        <Slider label="The bill" value={total} min={10} max={600} step={5} onChange={setTotal} format={(v) => money(v)} />
        <div>
          <p className="text-sm font-medium">How many people, you included</p>
          <div className="mt-2 flex items-center gap-3">
            <Step label="One fewer person" onClick={() => setPeople(Math.max(2, people - 1))} disabled={people <= 2}>−</Step>
            <div className="flex flex-1 justify-center gap-1.5" aria-live="polite" aria-label={`${people} people`}>
              {Array.from({ length: people }, (_, i) => (
                <span key={i} className={`pk-pop grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-[var(--accent-fill)] text-[var(--accent-fill-fg)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]'}`}>
                  {i === 0 ? 'You' : i + 1}
                </span>
              ))}
            </div>
            <Step label="One more person" onClick={() => setPeople(Math.min(8, people + 1))} disabled={people >= 8}>+</Step>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Tip</p>
          <div className="mt-2 flex gap-2">
            {[0, 15, 18, 20].map((t) => (
              <button key={t} type="button" onClick={() => setTip(t)} aria-pressed={tip === t}
                className={`pk-press flex-1 rounded-full border py-2 text-sm font-semibold transition-colors ${tip === t ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}>
                {t ? `${t}%` : 'None'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-[20px] bg-[var(--bg)] p-6 text-center" aria-live="polite">
        <p className="text-sm text-[var(--text-muted)]">Each person pays</p>
        <p className="pk-display mt-1 text-6xl tabular-nums text-[var(--accent)]">{money(each, true)}</p>
        <p className="mt-2 text-sm tabular-nums text-[var(--text-muted)]">{money(withTip, true)} with tip</p>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
          If it went on your card, {money(back, true)} is coming back to you. Pockit counts only your {money(each, true)} as spending, and keeps track of who still owes you.
        </p>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className="text-base font-semibold tabular-nums">{format(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(value)} className="pk-range mt-2 w-full" style={{ '--pk-fill': `${pct}%` } as React.CSSProperties} />
    </div>
  );
}

function Step({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="pk-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] text-lg font-semibold transition-colors hover:bg-[var(--surface-2)] disabled:opacity-35">
      {children}
    </button>
  );
}

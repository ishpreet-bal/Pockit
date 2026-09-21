'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, ShieldAlert, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, EmptyState, Input } from '@/components/ui/primitives';
import { StepTransition } from '@/components/ui/motion';
import { Mascot } from '@/components/brand/mascot';
import {
  INVESTING_DISCLAIMER, INVESTOR_QUESTIONS,
  type InvestorAnswers, type InvestorProfile,
} from '@/lib/finance/investing';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export interface WatchRow {
  id: string;
  symbol: string;
  name: string;
  priceMinor: number | null;
  changeBps: number | null;
  quoteCurrency: string | null;
}

/**
 * The whole investing experience: consent, profiling, the resulting mix, and a
 * watchlist.
 *
 * The consent gate is a real gate. Someone arriving here has not asked for
 * suggestions about their money, and the limits of what this does — particularly
 * that it is not day-trading guidance and not advice — need reading before any
 * number appears, not tucked under it in grey text afterwards.
 */
export function InvestingClient({
  profile, answers, watchlist, providerLabel, providerLive,
}: {
  profile: InvestorProfile | null;
  answers: InvestorAnswers | null;
  watchlist: WatchRow[];
  providerLabel: string;
  providerLive: boolean;
}) {
  const [stage, setStage] = useState<'intro' | 'questions' | 'done'>(profile ? 'done' : 'intro');

  /**
   * Follow the server.
   *
   * `router.refresh()` re-renders this component with a saved profile, but a
   * useState initialiser only runs once — so without this the questionnaire stayed
   * on screen after submitting and the result was never shown. The server is the
   * authority on whether a profile exists; the local stage has to follow it.
   */
  useEffect(() => {
    if (profile) setStage('done');
  }, [profile]);
  const [draft, setDraft] = useState<Record<string, string>>(
    answers
      ? {
          experience: answers.experience,
          horizon: answers.horizon,
          reaction: answers.reaction,
          hasBuffer: String(answers.hasBuffer),
          hasHighInterestDebt: String(answers.hasHighInterestDebt),
        }
      : {},
  );

  return (
    <div className="space-y-5">
      {!providerLive ? (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" strokeWidth={2.2} />
          <p className="text-sm">
            <strong>Prices on this page are sample data, not a real market.</strong>{' '}
            <span className="text-[var(--text-muted)]">
              {providerLabel}. Add a market-data key and every figure here becomes live, with no other change.
            </span>
          </p>
        </div>
      ) : null}

      {stage === 'done' && profile ? (
        <ProfileResult profile={profile} onRedo={() => setStage('questions')} />
      ) : stage === 'intro' ? (
        <Intro onStart={() => setStage('questions')} />
      ) : (
        <Questionnaire
          draft={draft}
          setDraft={setDraft}
          onCancel={() => setStage(profile ? 'done' : 'intro')}
          onSaved={() => setStage('done')}
        />
      )}

      <Watchlist rows={watchlist} live={providerLive} />
    </div>
  );
}

/* ---------------- Consent ---------------- */

function Intro({ onStart }: { onStart: () => void }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <Card>
      <CardBody className="pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent-fill)] text-[var(--accent-fill-fg)]">
            <Mascot mood="thinking" className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Before we talk about investing</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
              I can help you work out what kind of investor you are, and what broad mix of stocks, bonds
              and cash tends to suit that. There is a lot I deliberately will not do, and it is worth
              knowing which is which before we start.
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {INVESTING_DISCLAIMER.map((line) => (
            <li key={line} className="flex gap-2.5 text-sm leading-relaxed">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" strokeWidth={2} />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3.5">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent-fill)]"
          />
          <span className="text-sm">
            I understand that Pockit gives general information, not financial advice, and that nothing here
            is guaranteed.
          </span>
        </label>

        <Button variant="primary" className="mt-4 w-full" disabled={!accepted} onClick={onStart}>
          Continue
        </Button>
      </CardBody>
    </Card>
  );
}

/* ---------------- Questions ---------------- */

function Questionnaire({
  draft, setDraft, onCancel, onSaved,
}: {
  draft: Record<string, string>;
  setDraft: (next: Record<string, string>) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = INVESTOR_QUESTIONS[index];
  const last = index === INVESTOR_QUESTIONS.length - 1;

  async function save(finalDraft: Record<string, string>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/investing/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          experience: finalDraft.experience,
          horizon: finalDraft.horizon,
          reaction: finalDraft.reaction,
          hasBuffer: finalDraft.hasBuffer === 'true',
          hasHighInterestDebt: finalDraft.hasHighInterestDebt === 'true',
          acceptedDisclaimer: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save your answers.');
      }
      router.refresh();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  function choose(value: string) {
    const next = { ...draft, [question!.id]: value };
    setDraft(next);
    if (last) void save(next);
    else setIndex(index + 1);
  }

  return (
    <Card>
      <CardBody className="pt-5">
        <p className="text-xs font-medium text-[var(--text-subtle)]">
          Question {index + 1} of {INVESTOR_QUESTIONS.length}
        </p>

        <StepTransition stepKey={index} direction={1}>
          <h2 className="mt-1 text-lg font-semibold">{question?.prompt}</h2>
          {question?.help ? (
            <p className="mt-1 text-sm text-[var(--text-muted)]">{question.help}</p>
          ) : null}

          <div role="radiogroup" aria-label={question?.prompt} className="mt-3 space-y-1.5">
            {question?.choices.map((c) => {
              const on = draft[question.id] === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={saving}
                  onClick={() => choose(c.value)}
                  className={cn(
                    'w-full rounded-[var(--radius-control)] border p-3 text-left transition-colors disabled:opacity-60',
                    on
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span className="block text-sm font-medium">{c.label}</span>
                  {c.blurb ? (
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{c.blurb}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </StepTransition>

        {error ? (
          <p role="alert" className="mt-3 rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button className="flex-1" disabled={saving} onClick={() => (index === 0 ? onCancel() : setIndex(index - 1))}>
            {index === 0 ? 'Cancel' : 'Previous'}
          </Button>
        </div>
        {saving ? <p className="mt-2 text-center text-xs text-[var(--text-subtle)]">Working it out…</p> : null}
      </CardBody>
    </Card>
  );
}

/* ---------------- Result ---------------- */

function ProfileResult({ profile, onRedo }: { profile: InvestorProfile; onRedo: () => void }) {
  const a = profile.allocation;

  return (
    <Card>
      <CardBody className="pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent-fill)] text-[var(--accent-fill-fg)]">
            <Mascot mood={a ? 'happy' : 'concerned'} className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{profile.headline}</h2>
            {profile.blockers.length > 0 ? (
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Based on your answers, something else comes first.
              </p>
            ) : null}
          </div>
        </div>

        {a ? (
          <>
            {/* The mix, as one bar. Three numbers in a row are read as a list;
                one bar is read as a whole, which is what an allocation is. */}
            <div className="mt-5 flex h-4 overflow-hidden rounded-full">
              <div className="h-full bg-[var(--chart-1)]" style={{ width: `${a.stocksPct}%` }} />
              <div className="h-full bg-[var(--chart-2)]" style={{ width: `${a.bondsPct}%` }} />
              <div className="h-full bg-[var(--chart-5)]" style={{ width: `${a.cashPct}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                ['Stocks', a.stocksPct, 'var(--chart-1)'],
                ['Bonds', a.bondsPct, 'var(--chart-2)'],
                ['Cash', a.cashPct, 'var(--chart-5)'],
              ].map(([label, pct, colour]) => (
                <div key={String(label)}>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: String(colour) }} />
                    {label}
                  </span>
                  <p className="pk-figure mt-0.5 text-lg">{String(pct)}%</p>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {profile.blockers.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {profile.blockers.map((b) => (
              <li key={b} className="flex gap-2.5 rounded-[var(--radius-control)] bg-[var(--warning-soft)] px-3.5 py-2.5 text-sm">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" strokeWidth={2} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 space-y-2">
          {profile.reasoning.map((r) => (
            <p key={r} className="text-sm leading-relaxed text-[var(--text-muted)]">{r}</p>
          ))}
        </div>

        <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--text-subtle)]">
          This is a broad mix, not a recommendation to buy anything in particular, and not financial advice.
          Pockit does not predict short-term movements and is not built for day trading.
        </p>

        <Button className="mt-3" onClick={onRedo}>Answer again</Button>
      </CardBody>
    </Card>
  );
}

/* ---------------- Watchlist ---------------- */

function Watchlist({ rows, live }: { rows: WatchRow[]; live: boolean }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (symbol.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/investing/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not add that symbol.');
      setSymbol('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/investing/watchlist?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Watchlist"
        description={live ? 'Prices may be delayed' : 'Sample prices — not a real market'}
      />
      <CardBody>
        <div className="flex gap-2">
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
            placeholder="Add a symbol, e.g. VOO"
            aria-label="Symbol to add"
            className="flex-1"
          />
          <Button variant="primary" disabled={busy || symbol.trim() === ''} onClick={() => void add()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {error ? (
          <p role="alert" className="mt-2 rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
            {error}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing on your watchlist"
            description="Add a symbol to follow it here. Watching something is not owning it — nothing here counts towards your net worth."
          />
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {rows.map((row) => {
              const up = (row.changeBps ?? 0) >= 0;
              return (
                <li key={row.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{row.symbol}</p>
                    <p className="truncate text-xs text-[var(--text-subtle)]">{row.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold">
                      {row.priceMinor === null
                        ? '—'
                        : formatMoney(BigInt(Math.round(row.priceMinor)), row.quoteCurrency ?? 'USD')}
                    </p>
                    {row.changeBps !== null ? (
                      <p className={cn(
                        'flex items-center justify-end gap-0.5 text-xs',
                        up ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
                      )}>
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {(row.changeBps / 100).toFixed(2)}%
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(row.id)}
                    aria-label={`Remove ${row.symbol}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--negative)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

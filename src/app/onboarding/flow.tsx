'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, Field, Input, Select } from '@/components/ui/primitives';
import { StepTransition } from '@/components/ui/motion';
import { Mascot } from '@/components/brand/mascot';
import {
  CADENCES, CADENCE_LABELS, GOAL_CHOICES, buildPicture, toMonthlyMinor,
  type Answers, type Cadence,
} from '@/lib/onboarding/state';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

/**
 * Financial setup, one idea per screen.
 *
 * Three things make this a conversation rather than a form:
 *
 *  - One question is on screen at a time, and every one of them can be skipped.
 *    Skip is a visible button, not a hidden escape hatch, because the moment
 *    someone feels trapped they close the tab instead of finishing.
 *  - Every screen saves to the server before moving on. Closing the browser at
 *    question four and coming back tomorrow resumes at question four with the first
 *    three intact. Frontend state alone cannot do that.
 *  - The answers visibly become something. The last screen is their own numbers,
 *    not "setup complete".
 */

type StepId = 'intro' | 'income' | 'source' | 'recurring' | 'spending' | 'savings' | 'goals' | 'summary';

/**
 * Four questions. There were six: "what kind of work pays you" and a grid of
 * spending estimates asked the most of people and changed the least — nothing
 * downstream needed the first, and the second is measured properly once real
 * spending exists. Shorter setup is the difference between finishing and leaving.
 */
const STEPS: StepId[] = ['intro', 'income', 'recurring', 'savings', 'goals', 'summary'];
/** The intro and the summary are not questions, so they are not counted in the progress. */
const QUESTION_STEPS: StepId[] = STEPS.filter((s) => s !== 'intro' && s !== 'summary');

const SPEND_CATEGORIES = [
  'Housing', 'Food', 'Transportation', 'Insurance',
  'Subscriptions', 'Debt', 'Entertainment', 'Other',
];

export function OnboardingFlow({
  displayName, baseCurrency, initialStage, initialAnswers,
}: {
  displayName: string | null;
  baseCurrency: string;
  initialStage: string;
  initialAnswers: Answers;
}) {
  const router = useRouter();

  // Someone returning mid-flow lands on the first question they have not answered,
  // rather than at the beginning being asked things they already told us.
  const [step, setStep] = useState<StepId>(() => resumeAt(initialStage, initialAnswers));
  /** Which way the last move went, so the transition slides the way the flow reads. */
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Focus moves to the new question each time. Without this a keyboard or screen
  // reader user stays where the last button was and never hears the new question.
  useEffect(() => { heading.current?.focus(); }, [step]);

  const save = useCallback(async (patch: Partial<Answers>, stage?: string) => {
    setError(null);
    const next = { ...answers, ...patch };
    setAnswers(next);
    try {
      const response = await fetch('/api/onboarding/state', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: patch, ...(stage ? { stage } : {}) }),
      });
      if (!response.ok) setError('That did not save. Your answers so far are still here — try again.');
    } catch {
      setError('Could not reach the server. Your answers so far are still here.');
    }
  }, [answers]);

  function go(to: StepId, dir: 1 | -1) { setDirection(dir); setStep(to); }
  function next() { go(STEPS[Math.min(STEPS.indexOf(step) + 1, STEPS.length - 1)]!, 1); }
  function back() { go(STEPS[Math.max(STEPS.indexOf(step) - 1, 0)]!, -1); }

  async function skip(name: string) {
    await save({ skipped: [...(answers.skipped ?? []), name] });
    next();
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding/apply', { method: 'POST' });
      if (!response.ok) {
        setError('Setting things up did not finish. Nothing was lost — try again.');
        return;
      }
      router.push('/overview?tour=start');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const questionIndex = QUESTION_STEPS.indexOf(step);
  const picture = buildPicture(answers);
  const money = (minor: number) => formatMoney(BigInt(Math.round(minor)), baseCurrency);

  return (
    <div>
      {questionIndex >= 0 ? (
        <Progress current={questionIndex + 1} total={QUESTION_STEPS.length} onBack={back} />
      ) : null}

      <StepTransition stepKey={step} direction={direction}>
        <Card>
          <CardBody className="pt-5">
            {step === 'intro' ? (
              <Step
                heading={heading}
                title="Let's set up your Pockit."
                body="Four quick questions so Pockit starts from your real numbers. About a minute — skip anything you like."
                mascot
              >
                <div className="mt-5 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => { void save({}, 'financial_setup_started'); next(); }}
                  >
                    Continue
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={() => void finish()}>
                    Skip for now
                  </Button>
                </div>
              </Step>
            ) : null}

            {step === 'income' ? (
              <IncomeStep
                heading={heading}
                currency={baseCurrency}
                initial={{ amountMinor: answers.incomeMinor, cadence: answers.incomeCadence, nextDate: answers.incomeNextDate }}
                onDone={async (amountMinor, cadence, nextDate) => {
                  await save({ incomeMinor: amountMinor, incomeCadence: cadence, ...(nextDate ? { incomeNextDate: nextDate } : {}) });
                  next();
                }}
                onSkip={() => void skip('income')}
              />
            ) : null}

            {step === 'source' ? (
              <ChoiceStep
                heading={heading}
                title="What kind of work pays you?"
                body="It helps Pockit expect the right rhythm — a salary arrives differently from freelance work."
                choices={[
                  ['employment', 'A regular job'],
                  ['self_employment', "I'm self-employed"],
                  ['business', 'My own business'],
                  ['multiple', 'A mix of things'],
                  ['other', 'Something else'],
                ]}
                selected={answers.incomeSource ?? null}
                onPick={async (value) => {
                  await save({ incomeSource: value as Answers['incomeSource'] });
                  next();
                }}
                onSkip={() => void skip('source')}
              />
            ) : null}

            {step === 'recurring' ? (
              <RecurringStep
                heading={heading}
                currency={baseCurrency}
                initial={answers.recurring ?? []}
                onDone={async (list) => { await save({ recurring: list }); next(); }}
                onSkip={() => void skip('recurring')}
              />
            ) : null}

            {step === 'spending' ? (
              <SpendingStep
                heading={heading}
                currency={baseCurrency}
                initial={answers.spendingByCategory ?? {}}
                onDone={async (map) => { await save({ spendingByCategory: map }); next(); }}
                onSkip={() => void skip('spending')}
              />
            ) : null}

            {step === 'savings' ? (
              <AmountStep
                heading={heading}
                title="Do you have anything tucked away?"
                body="Savings, an emergency fund, cash you're not planning to touch. A rough number is fine."
                currency={baseCurrency}
                initialMinor={answers.savingsMinor}
                onDone={async (minor) => { await save({ savingsMinor: minor }); next(); }}
                onSkip={() => void skip('savings')}
              />
            ) : null}

            {step === 'goals' ? (
              <GoalsStep
                heading={heading}
                initial={answers.goals ?? []}
                onDone={async (list) => {
                  await save({ goals: list }, 'financial_setup_completed');
                  next();
                }}
                onSkip={() => void skip('goals')}
              />
            ) : null}

            {step === 'summary' ? (
              <Step heading={heading} title="You're ready." body={summaryLine(picture.missing)} mascot>
                <dl className="mt-5 space-y-2.5">
                  <Row label="Monthly income" value={picture.monthlyIncomeMinor === null ? null : money(picture.monthlyIncomeMinor)} />
                  <Row label="Recurring commitments" value={picture.monthlyCommitmentsMinor === null ? null : money(picture.monthlyCommitmentsMinor)} />
                  <Row
                    label="Flexible each month"
                    value={picture.flexibleMinor === null ? null : money(picture.flexibleMinor)}
                    emphasis
                  />
                  {picture.savingsMinor !== null ? <Row label="Set aside" value={money(picture.savingsMinor)} /> : null}
                  <Row label="Goals" value={String(picture.goalCount)} />
                </dl>

                {picture.missing.length > 0 ? (
                  <p className="mt-4 rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                    Add your {listWords(picture.missing)} later and these figures get sharper.
                    Nothing here is guessed — anything you skipped is simply left out.
                  </p>
                ) : null}

                <Button variant="primary" className="mt-5 w-full" disabled={busy} onClick={() => void finish()}>
                  {busy ? 'Setting things up…' : "Let's see your Pockit"}
                </Button>
              </Step>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 text-sm text-[var(--negative)]">{error}</p>
            ) : null}
          </CardBody>
        </Card>
      </StepTransition>

      {displayName && step === 'intro' ? (
        <p className="mt-4 text-center text-xs text-[var(--text-subtle)]">Signed in as {displayName}</p>
      ) : null}
    </div>
  );
}

/* ---------------- shared pieces ---------------- */

function Progress({ current, total, onBack }: { current: number; total: number; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the previous question"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--text-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div
        className="flex flex-1 items-center gap-1.5"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Question ${current} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < current ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)]',
            )}
          />
        ))}
      </div>
      {/* Stated in words as well as bars: a row of dots is not information to a
          screen reader, and "3 of 6" is what people actually want to know. */}
      <span className="shrink-0 text-xs tabular text-[var(--text-subtle)]">{current} of {total}</span>
    </div>
  );
}

function Step({
  heading, title, body, mascot, children,
}: {
  heading: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  body?: string;
  mascot?: boolean;
  children: React.ReactNode;
}) {
  // Each part of the question arrives a beat after the last — Pock, then the
  // question, then the explanation, then the controls — so a new screen reads as
  // someone speaking rather than a form being swapped in.
  return (
    <div className="pk-assemble">
      {mascot ? <Mascot mood="happy" className="mb-3 h-16 w-16" /> : null}
      <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold leading-snug outline-none">
        {title}
      </h1>
      {body ? <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p> : null}
      {children}
    </div>
  );
}

function SkipButton({ onSkip, label = 'Skip for now' }: { onSkip: () => void; label?: string }) {
  return (
    <Button variant="ghost" className="w-full" onClick={onSkip}>{label}</Button>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string | null; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-0">
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className={cn('tabular', emphasis ? 'text-lg font-semibold' : 'text-sm')}>
        {/* Not "$0". A figure nobody gave us is unknown, and saying zero would be
            the app's first lie about their life. */}
        {value ?? <span className="text-sm font-normal text-[var(--text-subtle)]">Not set yet</span>}
      </dd>
    </div>
  );
}

/* ---------------- the questions ---------------- */

function IncomeStep({
  heading, currency, initial, onDone, onSkip,
}: {
  heading: React.RefObject<HTMLHeadingElement | null>;
  currency: string;
  initial: { amountMinor?: number; cadence?: Cadence; nextDate?: string };
  onDone: (amountMinor: number, cadence: Cadence, nextDate: string | undefined) => void;
  onSkip: () => void;
}) {
  const [amount, setAmount] = useState(initial.amountMinor ? (initial.amountMinor / 100).toString() : '');
  const [cadence, setCadence] = useState<Cadence>(initial.cadence ?? 'biweekly');
  const [nextDate, setNextDate] = useState(initial.nextDate ?? '');
  const minor = Math.round((Number(amount.replace(/[^0-9.]/g, '')) || 0) * 100);
  const monthly = minor > 0 ? toMonthlyMinor(minor, cadence) : 0;

  return (
    <Step
      heading={heading}
      title="What does a typical paycheque look like?"
      body="The amount that actually lands in your account. If it changes from pay to pay, a rough average is perfect."
    >
      <form
        className="mt-5 space-y-3.5"
        onSubmit={(e) => { e.preventDefault(); if (minor > 0) onDone(minor, cadence, nextDate || undefined); }}
      >
        <Field label="Amount" htmlFor="income-amount">
          <Input
            id="income-amount"
            value={amount}
            autoFocus
            // The numeric keyboard on a phone, and a decimal point on it. Without
            // `inputMode` people get the full QWERTY keyboard for a number.
            inputMode="decimal"
            placeholder="0.00"
            className="h-12 text-lg"
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="How often?" htmlFor="income-cadence">
            <Select id="income-cadence" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
              {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABELS[c]}</option>)}
            </Select>
          </Field>
          {/* Without this there is no anchor, and the only date left to assume is
              today — which is how every paycheque read "due today". */}
          <Field label="Next payday" htmlFor="income-next">
            <Input id="income-next" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </Field>
        </div>

        {monthly > 0 ? (
          // The arithmetic nobody should have to do themselves, shown as it is done.
          <p aria-live="polite" className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
            That works out to about <strong className="text-[var(--text)]">{formatMoney(BigInt(monthly), currency)}</strong> a month.
          </p>
        ) : null}

        <Button type="submit" variant="primary" className="w-full" disabled={minor <= 0}>Continue</Button>
        <SkipButton onSkip={onSkip} label="I'd rather not say" />
      </form>
    </Step>
  );
}

function ChoiceStep({
  heading, title, body, choices, selected, onPick, onSkip,
}: {
  heading: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  body?: string;
  choices: readonly (readonly [string, string])[];
  selected: string | null;
  onPick: (value: string) => void;
  onSkip: () => void;
}) {
  return (
    <Step heading={heading} title={title} body={body}>
      <div className="mt-5 space-y-2">
        {choices.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            aria-pressed={selected === value}
            className={cn(
              'flex w-full items-center justify-between rounded-[var(--radius-control)] border px-4 py-3 text-left text-sm transition-colors',
              selected === value
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium'
                : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
            )}
          >
            {label}
            {selected === value ? <Check className="h-4 w-4 text-[var(--accent)]" /> : null}
          </button>
        ))}
        <SkipButton onSkip={onSkip} />
      </div>
    </Step>
  );
}

function AmountStep({
  heading, title, body, currency, initialMinor, onDone, onSkip,
}: {
  heading: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  body?: string;
  currency: string;
  initialMinor?: number;
  onDone: (minor: number) => void;
  onSkip: () => void;
}) {
  const [amount, setAmount] = useState(initialMinor ? (initialMinor / 100).toString() : '');
  const minor = Math.round((Number(amount.replace(/[^0-9.]/g, '')) || 0) * 100);

  return (
    <Step heading={heading} title={title} body={body}>
      <form className="mt-5 space-y-3.5" onSubmit={(e) => { e.preventDefault(); onDone(minor); }}>
        <Field label={`Roughly how much (${currency})`} htmlFor="amount">
          <Input
            id="amount" value={amount} autoFocus inputMode="decimal" placeholder="0.00"
            className="h-12 text-lg" onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={minor <= 0}>Continue</Button>
        <SkipButton onSkip={onSkip} label="Nothing yet" />
      </form>
    </Step>
  );
}

interface BillDraft { name: string; amount: string; cadence: Cadence; nextDate: string }

function RecurringStep({
  heading, currency, initial, onDone, onSkip,
}: {
  heading: React.RefObject<HTMLHeadingElement | null>;
  currency: string;
  initial: NonNullable<Answers['recurring']>;
  onDone: (list: NonNullable<Answers['recurring']>) => void;
  onSkip: () => void;
}) {
  const [asked, setAsked] = useState(initial.length > 0);
  const [bills, setBills] = useState<BillDraft[]>(
    initial.length > 0
      ? initial.map((b) => ({ name: b.name, amount: (b.amountMinor / 100).toString(), cadence: b.cadence, nextDate: b.nextDate ?? '' }))
      : [{ name: '', amount: '', cadence: 'monthly', nextDate: '' }],
  );

  const valid = bills.filter((b) => b.name.trim() !== '' && Number(b.amount) > 0);

  if (!asked) {
    return (
      <Step
        heading={heading}
        title="What gets paid without you thinking about it?"
        body="Rent, your phone, streaming, insurance, loan payments — the things that come out on their own every month."
      >
        <div className="mt-5 space-y-2">
          <Button variant="primary" className="w-full" onClick={() => setAsked(true)}>Add them now</Button>
          <SkipButton onSkip={onSkip} label="I'll do this later" />
        </div>
      </Step>
    );
  }

  return (
    <Step heading={heading} title="Your regular bills" body="Add as many as you like, and when each one is next due — that's how Pockit knows what's coming.">
      <div className="mt-4 space-y-3">
        {bills.map((bill, index) => (
          <div key={index} className="rounded-[var(--radius-control)] border border-[var(--border)] p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={bill.name}
                  placeholder="Rent, Netflix, car insurance…"
                  aria-label={`Bill ${index + 1} name`}
                  onChange={(e) => setBills((b) => b.map((x, i) => i === index ? { ...x, name: e.target.value } : x))}
                />
                <div className="flex gap-2">
                  <Input
                    value={bill.amount}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Bill ${index + 1} amount`}
                    className="flex-1"
                    onChange={(e) => setBills((b) => b.map((x, i) => i === index ? { ...x, amount: e.target.value } : x))}
                  />
                  <Select
                    value={bill.cadence}
                    aria-label={`Bill ${index + 1} frequency`}
                    className="flex-1"
                    onChange={(e) => setBills((b) => b.map((x, i) => i === index ? { ...x, cadence: e.target.value as Cadence } : x))}
                  >
                    {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABELS[c]}</option>)}
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="shrink-0">Next due</span>
                  <Input
                    type="date"
                    value={bill.nextDate}
                    aria-label={`Bill ${index + 1} next due date`}
                    className="h-8"
                    onChange={(e) => setBills((b) => b.map((x, i) => i === index ? { ...x, nextDate: e.target.value } : x))}
                  />
                </label>
              </div>
              {bills.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setBills((b) => b.filter((_, i) => i !== index))}
                  aria-label={`Remove bill ${index + 1}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded text-[var(--text-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--negative)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        ))}

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setBills((b) => [...b, { name: '', amount: '', cadence: 'monthly', nextDate: '' }])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add another
        </Button>

        {valid.length > 0 ? (
          <p aria-live="polite" className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
            About{' '}
            <strong className="text-[var(--text)]">
              {formatMoney(
                BigInt(valid.reduce((sum, b) => sum + toMonthlyMinor(Math.round(Number(b.amount) * 100), b.cadence), 0)),
                currency,
              )}
            </strong>{' '}
            a month committed.
          </p>
        ) : null}

        <Button
          variant="primary"
          className="w-full"
          disabled={valid.length === 0}
          onClick={() => onDone(valid.map((b) => ({
            name: b.name.trim(),
            amountMinor: Math.round(Number(b.amount) * 100),
            cadence: b.cadence,
            nextDate: b.nextDate || null,
          })))}
        >
          Done
        </Button>
        <SkipButton onSkip={onSkip} label="I'll do this later" />
      </div>
    </Step>
  );
}

function SpendingStep({
  heading, currency, initial, onDone, onSkip,
}: {
  heading: React.RefObject<HTMLHeadingElement | null>;
  currency: string;
  initial: Record<string, number>;
  onDone: (map: Record<string, number>) => void;
  onSkip: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, (v / 100).toString()])),
  );

  const filled = Object.entries(values)
    .map(([k, v]) => [k, Math.round((Number(v) || 0) * 100)] as const)
    .filter(([, v]) => v > 0);

  return (
    <Step
      heading={heading}
      title="Roughly where does the rest go?"
      body="Ballpark monthly numbers are perfect. Leave anything blank you're not sure about."
    >
      <div className="mt-4 space-y-2">
        {SPEND_CATEGORIES.map((name) => (
          <div key={name} className="flex items-center gap-3">
            <label htmlFor={`spend-${name}`} className="min-w-0 flex-1 truncate text-sm">{name}</label>
            <Input
              id={`spend-${name}`}
              value={values[name] ?? ''}
              inputMode="decimal"
              placeholder="—"
              className="h-9 w-28 text-right"
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            />
          </div>
        ))}

        {filled.length > 0 ? (
          <p aria-live="polite" className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
            About{' '}
            <strong className="text-[var(--text)]">
              {formatMoney(BigInt(filled.reduce((s, [, v]) => s + v, 0)), currency)}
            </strong>{' '}
            a month across what you filled in.
          </p>
        ) : null}

        <Button variant="primary" className="w-full" onClick={() => onDone(Object.fromEntries(filled))}>
          Continue
        </Button>
        <SkipButton onSkip={onSkip} />
      </div>
    </Step>
  );
}

function GoalsStep({
  heading, initial, onDone, onSkip,
}: {
  heading: React.RefObject<HTMLHeadingElement | null>;
  initial: NonNullable<Answers['goals']>;
  onDone: (list: NonNullable<Answers['goals']>) => void;
  onSkip: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial.map((g) => g.kind));

  function toggle(kind: string) {
    setPicked((p) => p.includes(kind) ? p.filter((k) => k !== kind) : [...p, kind]);
  }

  return (
    <Step
      heading={heading}
      title="What are you working toward?"
      body="Pick as many as you like. You'll set the amounts and dates once you're in."
    >
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {GOAL_CHOICES.map((choice) => {
          const on = picked.includes(choice.kind);
          return (
            <button
              key={choice.kind}
              type="button"
              onClick={() => toggle(choice.kind)}
              aria-pressed={on}
              className={cn(
                'flex items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3.5 py-3 text-left text-sm transition-colors',
                on
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
              )}
            >
              {choice.label}
              {on ? <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" /> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <Button
          variant="primary"
          className="w-full"
          disabled={picked.length === 0}
          onClick={() => onDone(picked.map((kind) => ({
            kind,
            name: GOAL_CHOICES.find((c) => c.kind === kind)?.label.replace(/^(Build an?|Buy an?|Pay off) /i, '') ?? kind,
          })))}
        >
          Continue
        </Button>
        <SkipButton onSkip={onSkip} label="Not sure yet" />
      </div>
    </Step>
  );
}

/* ---------------- helpers ---------------- */

/** Where a returning person picks up. */
function resumeAt(stage: string, answers: Answers): StepId {
  if (stage === 'not_started' || stage === 'account_created') return 'intro';
  if (stage === 'financial_setup_completed' || stage === 'done') return 'summary';
  // Mid-flow: the first question they have neither answered nor skipped.
  const skipped = new Set(answers.skipped ?? []);
  if (answers.incomeMinor === undefined && !skipped.has('income')) return 'income';
  if (answers.recurring === undefined && !skipped.has('recurring')) return 'recurring';
  if (answers.savingsMinor === undefined && !skipped.has('savings')) return 'savings';
  if (answers.goals === undefined && !skipped.has('goals')) return 'goals';
  return 'summary';
}

function summaryLine(missing: string[]): string {
  if (missing.length === 0) return "Here's where you're starting from.";
  return "Here's what we have so far. It gets sharper as you use Pockit.";
}

function listWords(items: string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Card, CardBody, Button, Input } from '@/components/ui/primitives';
import { StepTransition } from '@/components/ui/motion';
import { AllocationBar, AllocationSlider } from './allocator';
import { Money } from '@/components/finance/money';
import { buildPlan, BUDGET_INTENTS, type BudgetIntent } from '@/lib/finance/budget-plan';
import { parseMoney, formatMoney, toDecimalString } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

/**
 * The guided budget.
 *
 * Instead of presenting empty categories and asking the user to fill them in — which
 * asks the person who least knows what a reasonable grocery budget looks like to
 * supply one — this asks what they are trying to achieve and builds a concrete,
 * explained plan they can adjust.
 */
export function BudgetWizard({
  currency, knownIncomeMinor, knownFixedMinor, goalCommitmentMinor,
  monthsOfHistory, hasHistory, billCount, historicalEssentials,
}: {
  currency: string;
  knownIncomeMinor: string;
  knownFixedMinor: string;
  goalCommitmentMinor: string;
  monthsOfHistory: number;
  hasHistory: boolean;
  billCount: number;
  historicalEssentials: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // Which way the content should travel. Animating the wrong direction actively
  // misleads: it says you went back when you went forward.
  const [direction, setDirection] = useState<1 | -1>(1);
  const [exactEntry, setExactEntry] = useState(false);

  function goTo(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }
  const [intent, setIntent] = useState<BudgetIntent>('control_spending');
  const [income, setIncome] = useState(
    BigInt(knownIncomeMinor) > 0n ? toDecimalString(BigInt(knownIncomeMinor), currency) : '',
  );
  const [fixed, setFixed] = useState(toDecimalString(BigInt(knownFixedMinor), currency));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incomeMinor = safeParse(income, currency);
  const fixedMinor = safeParse(fixed, currency);

  const plan = useMemo(() => buildPlan({
    monthlyIncomeMinor: incomeMinor,
    fixedCostsMinor: fixedMinor,
    intent,
    historicalByCategory: BigInt(historicalEssentials) > 0n
      ? new Map([['__essentials__', BigInt(historicalEssentials)]])
      : new Map(),
    categories: BigInt(historicalEssentials) > 0n
      ? [{ id: '__essentials__', parentId: null, name: 'Essentials', slug: 'essentials', kind: 'expense', classification: 'variable', necessity: 'essential', color: null, icon: null }]
      : [],
    currency,
    goalCommitmentMinor: BigInt(goalCommitmentMinor),
  }), [incomeMinor, fixedMinor, intent, historicalEssentials, goalCommitmentMinor, currency]);

  const lines = plan.lines.map((l) => ({
    ...l,
    amountMinor: overrides[l.key] !== undefined ? safeParse(overrides[l.key]!, currency) : l.amountMinor,
  }));
  const allocated = lines.reduce((s, l) => s + l.amountMinor, 0n);
  const remaining = plan.availableMinor - allocated;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent,
          expectedIncomeMinor: incomeMinor.toString(),
          lines: lines.filter((l) => l.amountMinor > 0n).map((l) => ({
            label: l.label, bucket: l.bucket, amountMinor: l.amountMinor.toString(),
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save your budget.');
      }
      router.push('/budget');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
        {['What matters', 'Your numbers', 'Your plan'].map((label, i) => (
          <li key={label} className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
                style={{ width: i <= step ? '100%' : '0%' }}
              />
            </div>
            <p className={cn(
              'mt-1.5 flex items-center gap-1 text-2xs',
              i === step ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-subtle)]',
            )}>
              {i < step ? <Check className="h-3 w-3 text-[var(--accent)]" strokeWidth={3} /> : null}
              {label}
            </p>
          </li>
        ))}
      </ol>

      <StepTransition stepKey={step} direction={direction}>
      {step === 0 ? (
        <Card>
          <CardBody className="pt-5">
            <h2 className="text-lg font-semibold">What are you trying to do?</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              This decides how your spare money gets divided. You can change it later.
            </p>
            <div className="mt-4 space-y-1.5">
              {BUDGET_INTENTS.filter((i) => i.id !== 'custom').map((option) => (
                <button
                  key={option.id} type="button" onClick={() => { setIntent(option.id); goTo(1); }}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-[var(--radius-control)] border p-3 text-left transition-colors',
                    intent === option.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{option.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardBody className="pt-5">
            <h2 className="text-lg font-semibold">Check these two numbers</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {hasHistory && monthsOfHistory > 0
                ? `Filled in from your last ${monthsOfHistory} month${monthsOfHistory === 1 ? '' : 's'}${billCount > 0 ? ` and your ${billCount} recurring bill${billCount === 1 ? '' : 's'}` : ''}. Adjust anything that looks wrong.`
                : 'Pockit has nothing to go on yet, so these are yours to fill in. Rough numbers are fine.'}
            </p>

            <div className="mt-4 space-y-3.5">
              <label className="block text-sm font-medium">
                Money coming in each month
                <Input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)}
                  placeholder="5,000" className="mt-1 h-12 text-lg" />
                <span className="mt-1 block text-xs text-[var(--text-subtle)]">After tax — what actually lands in your account.</span>
              </label>

              <label className="block text-sm font-medium">
                Bills you pay every month
                <Input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)}
                  placeholder="1,800" className="mt-1 h-12 text-lg" />
                <span className="mt-1 block text-xs text-[var(--text-subtle)]">
                  Rent, phone, insurance, subscriptions — the ones that do not change.
                  {BigInt(knownFixedMinor) > 0n
                    ? ` Pockit found ${formatMoney(BigInt(knownFixedMinor), currency)} of these already.`
                    : ''}
                </span>
              </label>
            </div>

            {incomeMinor > 0n ? (
              <p className="mt-4 rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm">
                That leaves <strong><Money minor={plan.availableMinor} currency={currency} size="sm" tone="plain" /></strong>{' '}
                a month to work with.
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={() => goTo(0)}>Back</Button>
              <Button variant="primary" className="flex-1" disabled={incomeMinor <= 0n} onClick={() => goTo(2)}>
                See my plan
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardBody className="pt-5">
            <h2 className="text-lg font-semibold">Here&rsquo;s a starting plan</h2>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">{plan.summary}</p>

            {plan.notes.map((note) => (
              <p key={note} className="mt-3 rounded-[var(--radius-control)] bg-[var(--warning-soft)] px-3.5 py-2.5 text-sm text-[var(--text)]">
                {note}
              </p>
            ))}

            {plan.feasible ? (
              <>
                <div className="mt-4 divide-y divide-[var(--border)]">
                  {lines.map((line) => (
                    exactEntry ? (
                      <div key={line.key} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{line.label}</p>
                          <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{line.basis}</p>
                        </div>
                        <Input
                          inputMode="decimal"
                          aria-label={`${line.label} amount`}
                          value={overrides[line.key] ?? toDecimalString(line.amountMinor, currency)}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [line.key]: e.target.value }))}
                          className="h-9 w-28 text-right"
                        />
                      </div>
                    ) : (
                      <AllocationSlider
                        key={line.key}
                        line={line}
                        maxMinor={plan.availableMinor}
                        currency={currency}
                        onChange={(minor) =>
                          setOverrides((prev) => ({ ...prev, [line.key]: toDecimalString(minor, currency) }))
                        }
                      />
                    )
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setExactEntry((v) => !v)}
                  className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  {exactEntry ? 'Use sliders' : 'Type exact amounts'}
                </button>

                <div className="mt-3">
                  <AllocationBar lines={lines} availableMinor={plan.availableMinor} currency={currency} />
                </div>

                {error ? (
                  <p role="alert" className="mt-3 rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{error}</p>
                ) : null}

                <div className="mt-4 flex gap-2">
                  <Button className="flex-1" onClick={() => goTo(1)}>Back</Button>
                  <Button variant="primary" className="flex-1" disabled={saving || remaining < 0n} onClick={() => void save()}>
                    {saving ? 'Saving…' : 'Use this plan'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" onClick={() => goTo(1)}>Change the numbers</Button>
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}
      </StepTransition>
    </div>
  );
}

function safeParse(value: string, currency: string): bigint {
  try {
    const parsed = parseMoney(value, currency);
    return parsed === null ? 0n : parsed < 0n ? -parsed : parsed;
  } catch {
    return 0n;
  }
}

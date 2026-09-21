'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, Field, Input, Select, Button } from '@/components/ui/primitives';
import { StepTransition } from '@/components/ui/motion';
import { Mascot, type Mood } from '@/components/brand/mascot';
import { BUDGET_INTENTS, type BudgetIntent } from '@/lib/finance/budget-plan';
import { cn } from '@/lib/ui/cn';

/**
 * Onboarding is short and every step is skippable (spec §39): nothing blocks reaching
 * the dashboard. Progress is only used to prefill, never to gate.
 *
 * What makes it feel personal is not the number of questions — it is that the answers
 * visibly change what happens next. The goal chosen on the first screen renames the
 * goal step, seeds it, and decides which single next step is recommended at the end.
 * Asking and then ignoring the answer is worse than not asking.
 */
const ACCOUNT_TYPES = [
  { value: 'chequing', label: 'Chequing' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
];

interface AccountDraft { name: string; type: string; balance: string }

/**
 * The goal step, worded for what they actually said they were here for.
 *
 * "What are you saving for?" is the wrong question for someone whose answer was
 * "pay down debt" — they are not saving, and being asked as if they were is how an
 * onboarding flow proves it was not listening.
 */
function goalPrompt(intent: BudgetIntent | null): { title: string; body: string; pockLine: string } {
  switch (intent) {
    case 'pay_down_debt':
      return {
        title: 'What are you trying to clear?',
        body: 'Set the total you owe as the target. Pockit tracks it downward and shows what each month takes off it.',
        pockLine: 'Set the balance you want gone as the target — watching it fall is the whole point.',
      };
    case 'emergency_fund':
      return {
        title: 'How big should your safety net be?',
        body: 'Three months of expenses is the usual first target. Pockit works out the monthly amount and whether your cash flow supports it.',
        pockLine: 'Three months of expenses is a good first number if you are not sure.',
      };
    case 'big_purchase':
      return {
        title: 'What are you saving for?',
        body: 'Name it and give it a date. Pockit turns that into a monthly amount and tells you if it is realistic.',
        pockLine: 'Name the actual thing. It makes a surprising difference to whether it happens.',
      };
    case 'invest_more':
      return {
        title: 'What are you investing towards?',
        body: 'Optional, but a target and a date let Pockit check the monthly amount against what you actually have spare.',
        pockLine: 'Even for investing, a number and a date beat "as much as I can".',
      };
    case 'save_more':
      return {
        title: 'What is the saving for?',
        body: 'Optional. A named target is markedly easier to keep to than a vague intention to save more.',
        pockLine: 'Saving with a name attached tends to survive a bad month. Saving in general does not.',
      };
    default:
      return {
        title: 'Anything you are working towards?',
        body: 'Optional. Pockit will work out what to put aside each month and whether your cash flow supports it.',
        pockLine: 'Skip this if nothing springs to mind — you can add one any time.',
      };
  }
}

/**
 * The single next action, chosen from their answer.
 *
 * One recommendation, not a menu. A fresh account with no data cannot use five
 * suggestions, and offering them is how people end up doing none.
 */
function nextStepFor(intent: BudgetIntent | null): { title: string; why: string; cta: string; href: string } {
  switch (intent) {
    case 'pay_down_debt':
      return {
        title: 'Add what you owe',
        why: 'With balances and rates in, Pockit can compare payoff strategies and tell you what each one costs in interest and time.',
        cta: 'Add my debts',
        href: '/debts',
      };
    case 'control_spending':
      return {
        title: 'Bring in a bank statement',
        why: 'You said you want to see where it goes. One CSV or PDF gives you months of that immediately, instead of waiting for it to accumulate.',
        cta: 'Import a statement',
        href: '/imports/new',
      };
    case 'emergency_fund':
    case 'save_more':
    case 'big_purchase':
    case 'invest_more':
      return {
        title: 'Add the bills you already know about',
        why: 'Saving only means something once the bills are accounted for. With them in, Pockit can tell you what is genuinely spare.',
        cta: 'Add my bills',
        href: '/recurring',
      };
    default:
      return {
        title: 'Add the bills you already know about',
        why: 'Rent, phone, subscriptions. It takes a minute and immediately makes the dashboard honest.',
        cta: 'Add my bills',
        href: '/recurring',
      };
  }
}

export function OnboardingFlow({
  displayName, baseCurrency, workspaceName,
}: { displayName: string | null; baseCurrency: string; workspaceName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [incomeSchedule, setIncomeSchedule] = useState('biweekly');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [accounts, setAccounts] = useState<AccountDraft[]>([
    { name: 'Chequing', type: 'chequing', balance: '' },
  ]);
  const [goalName, setGoalName] = useState('Emergency fund');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [intent, setIntent] = useState<BudgetIntent | null>(null);
  const [goalEdited, setGoalEdited] = useState(false);
  const [experience, setExperience] = useState<'simple' | 'detailed'>('simple');

  /**
   * Seeds the goal name from the chosen intent, unless the person has already typed
   * their own. Overwriting what someone typed because they went back a step is the
   * kind of small betrayal that makes a form feel hostile.
   */
  function seedGoalFor(picked: BudgetIntent) {
    if (goalEdited) return;
    const seed = picked === 'pay_down_debt' ? 'Clear my debt'
      : picked === 'emergency_fund' ? 'Emergency fund'
      : picked === 'big_purchase' ? ''
      : picked === 'invest_more' ? 'Investments'
      : 'Savings';
    setGoalName(seed);
  }

  async function finish(withDemo: boolean, destination = '/overview') {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          incomeSchedule,
          incomeAmount: incomeAmount || null,
          accounts: accounts.filter((a) => a.name.trim()),
          goal: goalTarget ? { name: goalName, target: goalTarget, targetDate: goalDate || null } : null,
          loadDemo: withDemo,
          primaryIntent: intent,
          experienceLevel: experience,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save your setup.');
      }
      router.push(destination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  const steps = ['About you', 'Income', 'Accounts', 'A goal', 'Ready'];

  const firstName = displayName?.split(' ')[0] ?? null;

  /** What Pock says on each step, and how it looks while saying it. */
  const NARRATION: { mood: Mood; line: string }[] = [
    {
      mood: 'happy',
      line: firstName
        ? `Hi ${firstName} — I'm Pock. Tell me what you're here for and I'll set the rest up around it.`
        : "I'm Pock. Tell me what you're here for and I'll set the rest up around it.",
    },
    { mood: 'thinking', line: 'Knowing roughly what comes in is what lets me tell you what is safe to spend.' },
    { mood: 'thinking', line: 'Rough balances are fine. Every transaction you add from here adjusts them.' },
    { mood: 'happy', line: goalPrompt(intent).pockLine },
    { mood: 'celebrating', line: 'That is everything I need. You can change any of it later.' },
  ];

  return (
    <Card>
      <CardBody className="pt-5">
        <div className="mb-5 flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full ${i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)]'}`} />
              <p className={`mt-1 text-2xs ${i === step ? 'font-medium text-[var(--text)]' : 'text-[var(--text-subtle)]'}`}>{s}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--surface-2)] p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent-fill)] text-[var(--accent-fill-fg)]">
            <Mascot mood={NARRATION[step]?.mood ?? 'idle'} className="h-7 w-7" />
          </span>
          <p className="pt-1 text-sm leading-relaxed text-[var(--text-muted)]">{NARRATION[step]?.line}</p>
        </div>

        <StepTransition stepKey={step} direction={1}>
        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold">What brings you here?</h1>
            <p className="text-sm text-[var(--text-muted)]">
              This is the only answer that changes what Pockit does next, so it is worth a moment.
            </p>
            <div role="radiogroup" aria-label="What brings you here" className="space-y-1.5">
              {BUDGET_INTENTS.filter((i) => i.id !== 'custom' && i.id !== 'balanced').map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={intent === option.id}
                  onClick={() => { setIntent(option.id); seedGoalFor(option.id); }}
                  className={cn(
                    'w-full rounded-[var(--radius-control)] border p-3 text-left transition-colors',
                    intent === option.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{option.blurb}</span>
                </button>
              ))}
            </div>

            <div>
              <p className="text-sm font-medium">How much detail do you want?</p>
              <div role="radiogroup" aria-label="Level of detail" className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ['simple', 'Keep it simple', 'The essentials, nothing more.'],
                  ['detailed', 'Show me everything', 'Forecasts, analytics, the lot.'],
                ] as const).map(([value, label, blurb]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={experience === value}
                    onClick={() => setExperience(value)}
                    className={cn(
                      'rounded-[var(--radius-control)] border p-3 text-left transition-colors',
                      experience === value
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
                    )}
                  >
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{blurb}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-lg font-semibold">How does money come in?</h1>
            <p className="text-sm text-[var(--text-muted)]">
              An estimate is fine — it only seeds the first dashboard, and real transactions correct it.
            </p>
            <Field label="How often are you paid?" htmlFor="schedule">
              <Select id="schedule" value={incomeSchedule} onChange={(e) => setIncomeSchedule(e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="semimonthly">Twice a month</option>
                <option value="monthly">Monthly</option>
                <option value="irregular">Irregular</option>
              </Select>
            </Field>
            <Field label="Roughly how much per paycheque?" htmlFor="income" hint={`In ${baseCurrency}. An estimate is fine.`}>
              <Input id="income" inputMode="decimal" value={incomeAmount} onChange={(e) => setIncomeAmount(e.target.value)} placeholder="2,400" />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-lg font-semibold">Your accounts</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Balances are a starting point — every later transaction adjusts them. Credit cards are tracked as
              what you owe, so paying one off is never counted as new spending.
            </p>
            {accounts.map((account, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
                <Input
                  aria-label={`Account ${i + 1} name`} value={account.name}
                  onChange={(e) => setAccounts((prev) => prev.map((a, j) => (j === i ? { ...a, name: e.target.value } : a)))}
                  placeholder="Account name"
                />
                <Select
                  aria-label={`Account ${i + 1} type`} value={account.type} className="w-36"
                  onChange={(e) => setAccounts((prev) => prev.map((a, j) => (j === i ? { ...a, type: e.target.value } : a)))}
                >
                  {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                <Input
                  aria-label={`Account ${i + 1} balance`} inputMode="decimal" value={account.balance} className="col-span-2"
                  onChange={(e) => setAccounts((prev) => prev.map((a, j) => (j === i ? { ...a, balance: e.target.value } : a)))}
                  placeholder={account.type === 'credit_card' ? 'Amount owed (e.g. 850.00)' : 'Current balance (e.g. 4,125.00)'}
                />
              </div>
            ))}
            <Button type="button" onClick={() => setAccounts((p) => [...p, { name: '', type: 'chequing', balance: '' }])}>
              + Add another account
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-lg font-semibold">{goalPrompt(intent).title}</h1>
            <p className="text-sm text-[var(--text-muted)]">{goalPrompt(intent).body}</p>
            <Field label="Goal" htmlFor="goalName">
              <Input
                id="goalName"
                value={goalName}
                onChange={(e) => { setGoalName(e.target.value); setGoalEdited(true); }}
                placeholder={intent === 'big_purchase' ? 'A trip to Japan' : undefined}
              />
            </Field>
            <Field label="Target amount" htmlFor="goalTarget">
              <Input id="goalTarget" inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="15,000" />
            </Field>
            <Field label="Target date" htmlFor="goalDate" hint="Optional — without one we show progress but no monthly requirement.">
              <Input id="goalDate" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
            </Field>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-lg font-semibold">
              {firstName ? `You're set up, ${firstName}` : 'You are set up'}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {workspaceName} is ready. Based on what you told me, here is the one thing worth doing first —
              everything else can wait.
            </p>
            <div className="rounded-[var(--radius-card)] bg-[var(--accent-soft)] p-3.5">
              <p className="text-sm font-semibold">{nextStepFor(intent).title}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{nextStepFor(intent).why}</p>
            </div>
            {error ? <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{error}</p> : null}
            <Button variant="primary" onClick={() => void finish(false, nextStepFor(intent).href)} disabled={saving}>
              {saving ? 'Setting up…' : nextStepFor(intent).cta}
            </Button>
            <Button onClick={() => void finish(false)} disabled={saving}>
              Just take me to the dashboard
            </Button>
            <Button onClick={() => void finish(true)} disabled={saving}>
              Load demo data first
            </Button>
          </div>
        ) : null}

        </StepTransition>

        {step < 4 ? (
          <div className="mt-5 flex gap-2">
            {step > 0 ? <Button className="flex-1" onClick={() => setStep((s) => s - 1)}>Back</Button> : null}
            <Button variant="ghost" className="flex-1" onClick={() => setStep(4)}>Skip the rest</Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={step === 0 && intent === null}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

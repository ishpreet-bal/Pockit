'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, Field, Input, Select, Button } from '@/components/ui/primitives';

/**
 * Onboarding is short and every step is skippable (spec §39): nothing blocks reaching
 * the dashboard. Progress is only used to prefill, never to gate.
 */
const ACCOUNT_TYPES = [
  { value: 'chequing', label: 'Chequing' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
];

interface AccountDraft { name: string; type: string; balance: string }

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

  async function finish(withDemo: boolean) {
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
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save your setup.');
      }
      router.push('/overview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  const steps = ['Income', 'Accounts', 'A goal', 'Ready'];

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

        {step === 0 ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-lg font-semibold">
              {displayName ? `Welcome, ${displayName.split(' ')[0]}` : 'Welcome to Pockit'}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              A few optional questions so your first dashboard is useful. You can skip any of them.
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

        {step === 1 ? (
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

        {step === 2 ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-lg font-semibold">What are you saving for?</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Optional. Pockit will work out what you need to put aside each month and whether your cash flow supports it.
            </p>
            <Field label="Goal" htmlFor="goalName">
              <Input id="goalName" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
            </Field>
            <Field label="Target amount" htmlFor="goalTarget">
              <Input id="goalTarget" inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="15,000" />
            </Field>
            <Field label="Target date" htmlFor="goalDate" hint="Optional — without one we show progress but no monthly requirement.">
              <Input id="goalDate" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-3.5">
            <h1 className="text-lg font-semibold">You are set up</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {workspaceName} is ready with a full category tree. You can start by adding transactions, importing a
              file, or loading demo data to see how everything works before using your real records.
            </p>
            {error ? <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{error}</p> : null}
            <Button variant="primary" onClick={() => void finish(false)} disabled={saving}>
              {saving ? 'Setting up…' : 'Go to my dashboard'}
            </Button>
            <Button onClick={() => void finish(true)} disabled={saving}>
              Load demo data first
            </Button>
          </div>
        ) : null}

        {step < 3 ? (
          <div className="mt-5 flex gap-2">
            {step > 0 ? <Button className="flex-1" onClick={() => setStep((s) => s - 1)}>Back</Button> : null}
            <Button variant="ghost" className="flex-1" onClick={() => setStep(3)}>Skip</Button>
            <Button variant="primary" className="flex-1" onClick={() => setStep((s) => s + 1)}>Continue</Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

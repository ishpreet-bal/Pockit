'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/ui/cn';

interface Choice { id: string; name: string; icon: string | null; isPrimary: boolean }

const CADENCES = [
  { value: 'monthly', label: 'Every month' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'annual', label: 'Every year' },
  { value: 'custom', label: 'Every N days' },
];

/**
 * Add a recurring bill or income by hand.
 *
 * This needs no transaction history at all. Detection is a separate system that finds
 * patterns once enough data exists; making a new user import months of statements
 * before they could record their own rent was a dead end.
 */
export function AddSchedule({
  categories, accounts, today, trigger = 'Add recurring payment',
}: {
  categories: Choice[];
  accounts: { id: string; name: string }[];
  today: string;
  trigger?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [direction, setDirection] = useState<'outflow' | 'inflow'>('outflow');
  const [cadence, setCadence] = useState('monthly');
  const [categoryId, setCategoryId] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [startDate, setStartDate] = useState(today);

  const monthly = cadence === 'monthly' || cadence === 'quarterly' || cadence === 'annual';
  const relevant = categories.filter((c) =>
    direction === 'inflow' ? c.name === 'Income' : c.name !== 'Income',
  );
  const visible = showAll ? relevant : relevant.filter((c) => c.isPrimary);

  async function submit(form: FormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          amount: String(form.get('amount') ?? ''),
          cadence,
          interval: Number(form.get('interval') ?? 1) || 1,
          dayOfMonth: monthly ? Number(form.get('dayOfMonth') ?? 0) || null : null,
          startDate,
          endDate: null,
          direction,
          categoryId: categoryId || null,
          accountId: String(form.get('accountId') ?? '') || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save.');
      }
      setOpen(false);
      setCategoryId('');
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return <Button variant="primary" onClick={() => setOpen(true)}>{trigger}</Button>;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog" aria-modal="true" aria-label="Add recurring payment">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] animate-[pk-sheet-up_0.2s_ease-out] sm:max-w-md sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">Add a recurring payment</h2>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">✕</Button>
        </div>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Pockit will include this in your calendar, budget and projections from now on.
        </p>

        <div role="group" aria-label="Direction" className="mb-4 flex rounded-[var(--radius-control)] border border-[var(--border)] p-0.5">
          {([['outflow', 'A bill I pay'], ['inflow', 'Income I receive']] as const).map(([value, label]) => (
            <button
              key={value} type="button" onClick={() => { setDirection(value); setCategoryId(''); }}
              aria-pressed={direction === value}
              className={cn('flex-1 rounded-[6px] py-1.5 text-sm transition-colors',
                direction === value ? 'bg-[var(--surface-3)] font-medium' : 'text-[var(--text-subtle)] hover:text-[var(--text)]')}
            >
              {label}
            </button>
          ))}
        </div>

        <form action={submit} className="flex flex-col gap-3.5">
          <label className="text-sm font-medium">
            Name
            <Input name="name" required placeholder={direction === 'inflow' ? 'e.g. Salary' : 'e.g. Rent'} className="mt-1" />
          </label>

          <label className="text-sm font-medium">
            Amount
            <Input name="amount" inputMode="decimal" required placeholder="0.00" className="mt-1 h-12 text-lg" />
          </label>

          <label className="text-sm font-medium">
            How often
            <Select value={cadence} onChange={(e) => setCadence(e.target.value)} className="mt-1">
              {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </label>

          {cadence === 'custom' ? (
            <label className="text-sm font-medium">
              Repeat every
              <div className="mt-1 flex items-center gap-2">
                <Input name="interval" type="number" min={1} max={365} defaultValue={30} className="w-24" />
                <span className="text-sm text-[var(--text-muted)]">days</span>
              </div>
            </label>
          ) : <input type="hidden" name="interval" value={1} />}

          {monthly ? (
            <label className="text-sm font-medium">
              Day of the month
              <Input name="dayOfMonth" type="number" min={1} max={31}
                defaultValue={Number(today.slice(8, 10))} className="mt-1" />
              <span className="mt-1 block text-xs text-[var(--text-subtle)]">
                If a month is shorter, it moves to the last day rather than being skipped.
              </span>
            </label>
          ) : null}

          <label className="text-sm font-medium">
            Starting from
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="mt-1" />
          </label>

          <div>
            <span className="text-sm font-medium">Category</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {visible.map((c) => (
                <button key={c.id} type="button" onClick={() => setCategoryId(c.id)}
                  aria-pressed={categoryId === c.id}
                  className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors',
                    categoryId === c.id
                      ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]')}
                >
                  {c.icon} {c.name}
                </button>
              ))}
              {relevant.length > visible.length || showAll ? (
                <button type="button" onClick={() => setShowAll((v) => !v)}
                  className="rounded-full px-2.5 py-1 text-xs text-[var(--accent)] hover:underline">
                  {showAll ? 'Fewer' : 'More detail'}
                </button>
              ) : null}
            </div>
          </div>

          {accounts.length > 0 ? (
            <label className="text-sm font-medium">
              Account
              <Select name="accountId" defaultValue={accounts[0]?.id} className="mt-1">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{error}</p>
          ) : null}

          <div className="mt-1 flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Add it'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Remove a user-created schedule. Detected ones are dismissed, not deleted. */
export function DeleteSchedule({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (res.ok) startTransition(() => router.refresh());
    } finally { setBusy(false); setConfirming(false); }
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--negative)] hover:underline">
        Remove
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-xs">
      <span className="text-[var(--text-muted)]">Remove {name}?</span>
      <button type="button" onClick={() => void remove()} disabled={busy}
        className="font-medium text-[var(--negative)] hover:underline">{busy ? '…' : 'Yes'}</button>
      <button type="button" onClick={() => setConfirming(false)}
        className="text-[var(--text-subtle)] hover:underline">No</button>
    </span>
  );
}

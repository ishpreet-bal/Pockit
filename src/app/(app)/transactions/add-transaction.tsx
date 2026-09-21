'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/motion';
import { cn } from '@/lib/ui/cn';
import type { CategoryChoice } from './transaction-actions';

interface AccountOption { id: string; name: string; currency?: string }

/**
 * Quick add.
 *
 * Two deliberate simplifications over the previous version:
 *  - the category picker shows 13 first-choice options, not 60 leaves. Faced with
 *    too many, people pick nothing at all.
 *  - the date defaults to today but accepts a future one, and the form says plainly
 *    what that means, so planning a bill is an obvious thing to do rather than a
 *    trick that loses the transaction.
 */
export function AddTransaction({
  accounts, categories, today, variant = 'button',
}: {
  accounts: AccountOption[];
  categories: CategoryChoice[];
  today: string;
  /**
   * 'button' sits inline on the transactions page. 'fab' is the floating button
   * present on every screen, so that logging a spend never costs a navigation —
   * the single most repeated action in the app should never be more than one tap.
   */
  variant?: 'button' | 'fab';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [categoryId, setCategoryId] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [date, setDate] = useState(today);

  const isFuture = date > today;
  const relevant = categories.filter((c) =>
    direction === 'in'
      ? c.name === 'Income' || c.parent === 'Income'
      : c.name !== 'Income' && c.parent !== 'Income',
  );
  const visible = showAll ? relevant : relevant.filter((c) => c.isPrimary);

  function reset() {
    setCategoryId('');
    setShowAll(false);
    setDate(today);
    setDirection('out');
    setError(null);
  }

  async function submit(form: FormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: String(form.get('amount') ?? ''),
          description: String(form.get('description') ?? ''),
          accountId: String(form.get('accountId') ?? ''),
          categoryId: categoryId || null,
          postedDate: date,
          type: direction === 'in' ? 'income' : String(form.get('type') ?? 'expense'),
          businessClassification: 'personal',
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save the transaction.');
      }
      setOpen(false);
      reset();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    reset();
  }

  const trigger = variant === 'fab' ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Add transaction"
      className={cn(
        'fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-[var(--accent-fill)] text-[var(--accent-fill-fg)]',
        'shadow-[var(--shadow-lg)] transition-transform duration-200 hover:scale-105 active:scale-95',
        // Clears the mobile tab bar, and sits in the normal corner once it is gone.
        'bottom-[calc(env(safe-area-inset-bottom)+72px)] md:bottom-6 md:right-6',
      )}
    >
      <Plus className="h-6 w-6" strokeWidth={2.4} />
    </button>
  ) : (
    <Button variant="primary" onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4" strokeWidth={2.2} />
      Add transaction
    </Button>
  );

  return (
    <>
      {open ? null : trigger}
      <Sheet open={open} onClose={close} title="Add transaction">
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Add transaction</h2>
          <button
            type="button" onClick={close} aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div role="group" aria-label="Direction" className="mb-4 flex rounded-[var(--radius-control)] border border-[var(--border)] p-0.5">
          {([['out', 'Money out'], ['in', 'Money in']] as const).map(([value, label]) => (
            <button
              key={value} type="button" onClick={() => { setDirection(value); setCategoryId(''); }}
              aria-pressed={direction === value}
              className={cn(
                'flex-1 rounded-[6px] py-1.5 text-sm transition-colors',
                direction === value
                  ? 'bg-[var(--surface-3)] font-medium text-[var(--text)]'
                  : 'text-[var(--text-subtle)] hover:text-[var(--text)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <form action={submit} className="flex flex-col gap-3.5">
          <label className="text-sm font-medium">
            Amount
            <Input name="amount" inputMode="decimal" autoFocus required placeholder="0.00" className="mt-1 h-12 text-lg" />
          </label>

          <label className="text-sm font-medium">
            What was it?
            <Input name="description" required placeholder={direction === 'in' ? 'e.g. Payday' : 'e.g. Shell'} className="mt-1" />
          </label>

          <div>
            <span className="text-sm font-medium">Category</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {visible.map((c) => (
                <button
                  key={c.id} type="button" onClick={() => setCategoryId(c.id)}
                  aria-pressed={categoryId === c.id}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    categoryId === c.id
                      ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]',
                  )}
                >
                  {c.name}
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

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">
              Date
              <Input name="postedDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1" />
            </label>
            <label className="text-sm font-medium">
              Account
              <Select name="accountId" required defaultValue={accounts[0]?.id} className="mt-1">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
          </div>

          {isFuture ? (
            <p className="rounded-[var(--radius-control)] bg-[var(--info-soft)] px-3 py-2 text-xs text-[var(--info)]">
              This is in the future, so it will be tracked as an upcoming bill rather than money already spent.
              You will find it under <strong>Upcoming</strong>.
            </p>
          ) : null}

          {direction === 'out' ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                More options
              </summary>
              <label className="mt-2 block text-sm font-medium">
                Type
                <Select name="type" defaultValue="expense" className="mt-1">
                  <option value="expense">Expense</option>
                  <option value="refund">Refund</option>
                  <option value="transfer">Transfer between my accounts</option>
                  <option value="investment">Saving or investing</option>
                  <option value="debt_payment">Debt payment</option>
                </Select>
              </label>
            </details>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{error}</p>
          ) : null}

          <div className="mt-1 flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
      </Sheet>
    </>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui/primitives';

interface Option { id: string; name: string; icon?: string | null; currency?: string }

/**
 * Quick add. The amount field is first and numeric so the mobile keypad opens
 * immediately — this is the highest-frequency action in the whole app.
 */
export function AddTransaction({ accounts, categories }: { accounts: Option[]; categories: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: String(formData.get('amount') ?? ''),
          description: String(formData.get('description') ?? ''),
          accountId: String(formData.get('accountId') ?? ''),
          categoryId: String(formData.get('categoryId') ?? '') || null,
          postedDate: String(formData.get('postedDate') ?? ''),
          type: String(formData.get('type') ?? 'expense'),
          businessClassification: String(formData.get('businessClassification') ?? 'personal'),
          notes: String(formData.get('notes') ?? '') || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save the transaction.');
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return <Button variant="primary" onClick={() => setOpen(true)}>Add transaction</Button>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Add transaction">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] animate-[pk-sheet-up_0.2s_ease-out] sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Add transaction</h2>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">✕</Button>
        </div>

        <form action={submit} className="flex flex-col gap-3">
          <Field label="Amount" htmlFor="amount" hint="Enter a positive amount; the type below decides the direction.">
            <Input id="amount" name="amount" inputMode="decimal" autoFocus required placeholder="0.00" />
          </Field>

          <Field label="Description" htmlFor="description">
            <Input id="description" name="description" required placeholder="e.g. Shell" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="type">
              <Select id="type" name="type" defaultValue="expense">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="refund">Refund</option>
                <option value="transfer">Transfer</option>
                <option value="investment">Investment</option>
                <option value="debt_payment">Debt payment</option>
              </Select>
            </Field>
            <Field label="Date" htmlFor="postedDate">
              <Input id="postedDate" name="postedDate" type="date" defaultValue={today} required />
            </Field>
          </div>

          <Field label="Account" htmlFor="accountId">
            <Select id="accountId" name="accountId" required defaultValue={accounts[0]?.id}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>

          <Field label="Category" htmlFor="categoryId">
            <Select id="categoryId" name="categoryId" defaultValue="">
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </Select>
          </Field>

          <Field label="Classification" htmlFor="businessClassification">
            <Select id="businessClassification" name="businessClassification" defaultValue="personal">
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </Select>
          </Field>

          <Field label="Notes" htmlFor="notes">
            <Input id="notes" name="notes" placeholder="Optional" />
          </Field>

          {error ? <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{error}</p> : null}

          <div className="mt-1 flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

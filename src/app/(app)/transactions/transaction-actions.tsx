'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Select, Input } from '@/components/ui/primitives';
import { cn } from '@/lib/ui/cn';

export interface EditableTxn {
  id: string;
  postedDate: string;
  description: string;
  amountMajor: string;
  type: string;
  categoryId: string | null;
  accountId: string;
  businessClassification: string;
  isRecurring: boolean;
}

export interface CategoryChoice {
  id: string; name: string; icon: string | null; parent: string | null; isPrimary: boolean;
}

/**
 * Row actions for a transaction.
 *
 * Deletion was simply missing before — a transaction entered by mistake could not be
 * removed. Confirmation is a two-tap inline swap rather than a modal: enough to stop
 * an accidental tap, not enough to be annoying when it is deliberate.
 */
export function TransactionActions({
  txn, categories, accounts, currency,
}: {
  txn: EditableTxn;
  categories: CategoryChoice[];
  accounts: { id: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onAway(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onAway); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  async function call(path: string, init: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(path, init);
      if (res.ok) startTransition(() => router.refresh());
      return res.ok;
    } finally {
      setBusy(false);
      setOpen(false);
      setConfirming(false);
    }
  }

  const remove = () => call(`/api/transactions/${txn.id}`, { method: 'DELETE' });
  const duplicate = () => call(`/api/transactions/${txn.id}`, { method: 'POST' });
  const toggleRecurring = () => call(`/api/transactions/${txn.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isRecurring: !txn.isRecurring }),
  });

  if (confirming) {
    return (
      <span className="flex items-center justify-end gap-2 whitespace-nowrap text-xs">
        <span className="text-[var(--text-muted)]">Delete?</span>
        <button type="button" onClick={() => void remove()} disabled={busy}
          className="font-medium text-[var(--negative)] hover:underline">
          {busy ? '…' : 'Delete'}
        </button>
        <button type="button" onClick={() => setConfirming(false)}
          className="text-[var(--text-subtle)] hover:underline">Cancel</button>
      </span>
    );
  }

  return (
    <>
      <div className="relative flex justify-end" ref={menuRef}>
        <button
          type="button"
          aria-label={`Actions for ${txn.description}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded px-2 py-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
        >
          ⋯
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-md)]"
          >
            {[
              { label: 'Edit', onClick: () => { setEditing(true); setOpen(false); } },
              { label: 'Duplicate', onClick: () => void duplicate() },
              { label: txn.isRecurring ? 'Not recurring' : 'Mark as recurring', onClick: () => void toggleRecurring() },
            ].map((item) => (
              <button
                key={item.label} type="button" role="menuitem" onClick={item.onClick} disabled={busy}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                {item.label}
              </button>
            ))}
            <div className="my-1 border-t border-[var(--border)]" />
            <button
              type="button" role="menuitem"
              onClick={() => { setConfirming(true); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm text-[var(--negative)] hover:bg-[var(--negative-soft)]"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <EditSheet
          txn={txn} categories={categories} accounts={accounts} currency={currency}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); startTransition(() => router.refresh()); }}
        />
      ) : null}
    </>
  );
}

function EditSheet({
  txn, categories, accounts, currency, onClose, onSaved,
}: {
  txn: EditableTxn;
  categories: CategoryChoice[];
  accounts: { id: string; name: string }[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState(txn.categoryId ?? '');
  const [showAll, setShowAll] = useState(
    Boolean(txn.categoryId && !categories.find((c) => c.id === txn.categoryId)?.isPrimary),
  );

  const visible = showAll ? categories : categories.filter((c) => c.isPrimary);
  const categoryChanged = categoryId !== (txn.categoryId ?? '');

  async function submit(form: FormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${txn.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postedDate: String(form.get('postedDate') ?? ''),
          description: String(form.get('description') ?? ''),
          amount: String(form.get('amount') ?? ''),
          type: String(form.get('type') ?? ''),
          categoryId: categoryId || null,
          accountId: String(form.get('accountId') ?? ''),
          businessClassification: String(form.get('businessClassification') ?? 'personal'),
          rememberCategory: categoryChanged && form.get('remember') === 'on',
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save.');
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog" aria-modal="true" aria-label="Edit transaction">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] animate-[pk-sheet-up_0.2s_ease-out] sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Edit transaction</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
        </div>

        <form action={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium">Description
            <Input name="description" defaultValue={txn.description} required className="mt-1" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">Amount ({currency})
              <Input name="amount" inputMode="decimal" defaultValue={txn.amountMajor} required className="mt-1" />
            </label>
            <label className="text-sm font-medium">Date
              <Input name="postedDate" type="date" defaultValue={txn.postedDate} required className="mt-1" />
            </label>
          </div>

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
                  {c.icon} {c.name}
                </button>
              ))}
              <button type="button" onClick={() => setShowAll((v) => !v)}
                className="rounded-full px-2.5 py-1 text-xs text-[var(--accent)] hover:underline">
                {showAll ? 'Fewer' : 'More detail'}
              </button>
            </div>
            {categoryChanged && categoryId ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <input type="checkbox" name="remember" defaultChecked className="h-3.5 w-3.5 accent-[var(--accent)]" />
                Always use this category for &ldquo;{txn.description}&rdquo;
              </label>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">Type
              <Select name="type" defaultValue={txn.type} className="mt-1">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="refund">Refund</option>
                <option value="transfer">Transfer</option>
                <option value="investment">Saving or investing</option>
                <option value="debt_payment">Debt payment</option>
              </Select>
            </label>
            <label className="text-sm font-medium">Account
              <Select name="accountId" defaultValue={txn.accountId} className="mt-1">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
          </div>

          <input type="hidden" name="businessClassification" value={txn.businessClassification} />

          {error ? (
            <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{error}</p>
          ) : null}

          <div className="mt-1 flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

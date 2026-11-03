'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { SUPPORTED_CURRENCIES } from '@/lib/money';

interface Holding { id?: string; name: string; symbol: string; quantity: string; currency: string; currentValue: string; costBasis: string }

export function HoldingEditor({ currency, holding }: { currency: string; holding?: Holding }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Holding>(holding ?? { name: '', symbol: '', quantity: '0', currency, currentValue: '', costBasis: '' });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/investing/holdings', { method: holding ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Couldn’t save this holding.');
      setOpen(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save this holding.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!holding?.id || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/investing/holdings?id=${holding.id}`, { method: 'DELETE' });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? 'Couldn’t remove this holding.'); }
      setOpen(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t remove this holding.'); }
    finally { setBusy(false); }
  }
  if (!open) return <Button size="sm" variant={holding ? 'secondary' : 'primary'} onClick={() => { setDraft(holding ?? { name: '', symbol: '', quantity: '0', currency, currentValue: '', costBasis: '' }); setError(null); setRemoving(false); setOpen(true); }}>{holding ? 'Edit holding' : 'Add holding'}</Button>;
  return <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left" aria-label={holding ? 'Edit holding' : 'Add holding'}>
    <p className="text-sm font-semibold">{holding ? 'Edit holding' : 'Record what you own'}</p>
    <p className="max-w-lg text-xs text-[var(--text-muted)]">Tracking only. This does not buy investments, post trades or change account balances. Enter total values in the selected currency.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {([
        ['name', 'Name', 'e.g. My index fund'], ['symbol', 'Ticker (optional)', 'e.g. AAPL'],
        ['quantity', 'Units', 'e.g. 2.5'], ['currentValue', 'Recorded total value', 'e.g. 500.00'], ['costBasis', 'Total cost basis', 'e.g. 450.00'],
      ] as const).map(([key, label, placeholder]) => <Field key={key} label={label} htmlFor={`${id}-${key}`}><Input id={`${id}-${key}`} value={draft[key]} placeholder={placeholder} required={key !== 'symbol'} maxLength={key === 'name' ? 120 : key === 'symbol' ? 12 : 30} inputMode={['quantity', 'currentValue', 'costBasis'].includes(key) ? 'decimal' : 'text'} disabled={busy} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></Field>)}
      <Field label="Currency" htmlFor={`${id}-currency`}><Select id={`${id}-currency`} value={draft.currency} disabled={busy} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>{SUPPORTED_CURRENCIES.map((cur) => <option key={cur.code} value={cur.code}>{cur.code}</option>)}</Select></Field>
    </div>
    {error ? <p role="alert" className="text-sm text-[var(--negative)]">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save holding'}</Button>
      <Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
      {holding ? <Button disabled={busy} onClick={() => setRemoving(true)}>Remove holding</Button> : null}
    </div>
    {removing ? <div className="space-y-2 text-xs"><p>Remove this holding and its purchase lots from tracking? Existing transactions and account balances stay as they are.</p><Button disabled={busy} onClick={() => void remove()}>Confirm removal</Button></div> : null}
  </form>;
}

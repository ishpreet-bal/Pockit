'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, Button, Badge, Select, Input } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { cn } from '@/lib/ui/cn';

export interface Candidate {
  id: string;
  postedDate: string | null;
  description: string;
  merchantName: string;
  amountMinor: string | null;
  currency: string;
  type: string;
  categoryId: string | null;
  accountId: string | null;
  businessClassification: string;
  status: string;
  confidence: number | null;
  fieldConfidence: Record<string, number> | null;
  duplicateScore: number | null;
  duplicateReasons: { scope?: string; confidence?: string; reasons?: { detail: string; points: number }[] } | null;
  duplicateOf: { description: string; postedDate: string; amountMinor: string } | null;
  provenance: { sourceRef?: string | null; rawDate?: string; rawAmount?: string; dateAmbiguous?: boolean; typeReason?: string } | null;
  validationError: string | null;
}

interface CategoryOption { id: string; name: string; icon: string | null; parent: string | null }

const LOW_CONFIDENCE = 70;

/**
 * The review queue (spec §9, §25).
 *
 * This is the highest-volume interaction in the product — a statement import can be
 * 60 rows — so it is built for the keyboard first: j/k to move, Enter to accept, r to
 * reject, e to edit, a to accept everything confident. Low-confidence fields are
 * outlined so the eye goes straight to what needs checking.
 */
export function ReviewQueue({
  importId, status, currency, locale, candidates: initial, categories, accounts,
}: {
  importId: string;
  status: string;
  currency: string;
  locale: string;
  candidates: Candidate[];
  categories: CategoryOption[];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'needs_check' | 'duplicates'>('all');
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const committed = status === 'committed' || status === 'rolled_back';

  const visible = useMemo(() => {
    if (filter === 'needs_check') {
      return rows.filter((r) => (r.confidence ?? 100) < LOW_CONFIDENCE || r.validationError || r.provenance?.dateAmbiguous);
    }
    if (filter === 'duplicates') return rows.filter((r) => r.duplicateScore !== null && r.duplicateScore >= 50);
    return rows;
  }, [rows, filter]);

  const counts = useMemo(() => ({
    accepted: rows.filter((r) => r.status === 'accepted').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    needsCheck: rows.filter((r) => (r.confidence ?? 100) < LOW_CONFIDENCE || r.validationError).length,
  }), [rows]);

  const patch = useCallback(async (updates: Partial<Candidate> & { id: string }[] | Array<Partial<Candidate> & { id: string }>) => {
    const list = Array.isArray(updates) ? updates : [updates];
    await fetch(`/api/imports/${importId}/candidates`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'update', updates: list }),
    });
  }, [importId]);

  const setStatus = useCallback((id: string, next: Candidate['status']) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    void patch([{ id, status: next } as Partial<Candidate> & { id: string }]);
  }, [patch]);

  const applyEdit = useCallback((id: string, changes: Partial<Candidate>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
    void patch([{ id, ...changes } as Partial<Candidate> & { id: string }]);
  }, [patch]);

  /* Keyboard navigation. */
  useEffect(() => {
    if (committed) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') setEditing(null);
        return;
      }
      const row = visible[cursor];
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, visible.length - 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === 'Enter' && row) { e.preventDefault(); setStatus(row.id, 'accepted'); setCursor((c) => Math.min(c + 1, visible.length - 1)); }
      else if (e.key === 'r' && row) { setStatus(row.id, 'rejected'); setCursor((c) => Math.min(c + 1, visible.length - 1)); }
      else if (e.key === 'd' && row) { setStatus(row.id, 'duplicate'); setCursor((c) => Math.min(c + 1, visible.length - 1)); }
      else if (e.key === 'e' && row) { e.preventDefault(); setEditing(row.id); }
      else if (e.key === 'Escape') setEditing(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, visible, setStatus, committed]);

  useEffect(() => {
    const row = visible[cursor];
    if (row) rowRefs.current[row.id]?.scrollIntoView({ block: 'nearest' });
  }, [cursor, visible]);

  async function acceptAllConfident() {
    setBusy(true);
    try {
      const res = await fetch(`/api/imports/${importId}/candidates`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'accept_all_confident', confidenceFloor: 85 }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((r) =>
          r.status === 'pending' && (r.confidence ?? 0) >= 85 ? { ...r, status: 'accepted' } : r,
        ));
      }
    } finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/imports/${importId}/commit`, { method: 'POST' });
      const body = (await res.json().catch(() => null)) as { imported?: number; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'Could not save these transactions.');
      router.push('/transactions');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(false); }
  }

  if (committed) {
    return (
      <div className="px-4 py-4 sm:px-6">
        <Card>
          <CardBody className="pt-5 text-center">
            <p className="font-medium">This import has already been {status === 'committed' ? 'saved' : 'rolled back'}.</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {counts.accepted} of {rows.length} rows were accepted.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button onClick={() => router.push('/imports')}>Back to imports</Button>
              <Button variant="primary" onClick={() => router.push('/transactions')}>View transactions</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'needs_check', 'duplicates'] as const).map((f) => (
              <button
                key={f} type="button" onClick={() => { setFilter(f); setCursor(0); }}
                aria-pressed={filter === f}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  filter === f
                    ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]',
                )}
              >
                {f === 'all' ? `All ${rows.length}`
                  : f === 'needs_check' ? `Needs checking ${counts.needsCheck}`
                  : `Duplicates ${counts.duplicate}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">
              <strong className="text-[var(--text)]">{counts.accepted}</strong> accepted
            </span>
            <Button size="sm" onClick={() => void acceptAllConfident()} disabled={busy}>
              Accept all confident
            </Button>
            <Button variant="primary" size="sm" onClick={() => void commit()} disabled={busy || counts.accepted === 0}>
              {busy ? 'Saving…' : `Import ${counts.accepted}`}
            </Button>
          </div>
        </CardBody>
      </Card>

      <p className="text-xs text-[var(--text-subtle)]">
        Keyboard: <kbd className="rounded border border-[var(--border)] px-1">j</kbd>/<kbd className="rounded border border-[var(--border)] px-1">k</kbd> move ·
        <kbd className="ml-1 rounded border border-[var(--border)] px-1">Enter</kbd> accept ·
        <kbd className="ml-1 rounded border border-[var(--border)] px-1">r</kbd> reject ·
        <kbd className="ml-1 rounded border border-[var(--border)] px-1">d</kbd> duplicate ·
        <kbd className="ml-1 rounded border border-[var(--border)] px-1">e</kbd> edit
      </p>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{error}</p>
      ) : null}

      <Card>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['Date', 'Description', 'Category', 'Type', 'Amount', ''].map((h, i) => (
                  <th key={h || i} className={cn(
                    'sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium uppercase tracking-[0.04em] text-[var(--text-subtle)]',
                    i === 4 ? 'text-right' : 'text-left',
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <CandidateRow
                  key={row.id}
                  ref={(el) => { rowRefs.current[row.id] = el; }}
                  row={row}
                  active={i === cursor}
                  editing={editing === row.id}
                  currency={currency}
                  locale={locale}
                  categories={categories}
                  accounts={accounts}
                  onFocus={() => setCursor(i)}
                  onEdit={() => setEditing(row.id)}
                  onCloseEdit={() => setEditing(null)}
                  onStatus={(s) => setStatus(row.id, s)}
                  onChange={(changes) => applyEdit(row.id, changes)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CandidateRow({
  ref, row, active, editing, currency, locale, categories, accounts,
  onFocus, onEdit, onCloseEdit, onStatus, onChange,
}: {
  ref: (el: HTMLTableRowElement | null) => void;
  row: Candidate;
  active: boolean;
  editing: boolean;
  currency: string;
  locale: string;
  categories: CategoryOption[];
  accounts: { id: string; name: string }[];
  onFocus: () => void;
  onEdit: () => void;
  onCloseEdit: () => void;
  onStatus: (s: Candidate['status']) => void;
  onChange: (changes: Partial<Candidate>) => void;
}) {
  const fc = row.fieldConfidence ?? {};
  const lowDate = (fc.date ?? 100) < LOW_CONFIDENCE || row.provenance?.dateAmbiguous;
  const lowAmount = (fc.amount ?? 100) < LOW_CONFIDENCE;
  const isDuplicate = row.status === 'duplicate';
  const category = categories.find((c) => c.id === row.categoryId);

  const rowTone =
    row.status === 'accepted' ? 'bg-[var(--positive-soft)]'
    : row.status === 'rejected' ? 'opacity-45'
    : isDuplicate ? 'bg-[var(--warning-soft)]'
    : '';

  if (editing) {
    return (
      <tr ref={ref} className="border-b border-[var(--border)] bg-[var(--surface-2)]">
        <td colSpan={6} className="px-3 py-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-[var(--text-muted)]">Date
              <Input className="mt-1 h-9" type="date" defaultValue={row.postedDate ?? ''}
                onBlur={(e) => onChange({ postedDate: e.target.value })} />
            </label>
            <label className="text-xs text-[var(--text-muted)]">Description
              <Input className="mt-1 h-9" defaultValue={row.description}
                onBlur={(e) => onChange({ description: e.target.value, merchantName: e.target.value })} />
            </label>
            <label className="text-xs text-[var(--text-muted)]">Category
              <Select className="mt-1 h-9" defaultValue={row.categoryId ?? ''}
                onChange={(e) => onChange({ categoryId: e.target.value || null })}>
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.parent ? `${c.parent} › ` : ''}{c.name}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-[var(--text-muted)]">Type
              <Select className="mt-1 h-9" defaultValue={row.type}
                onChange={(e) => onChange({ type: e.target.value })}>
                {['expense', 'income', 'transfer', 'refund', 'investment', 'debt_payment'].map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-[var(--text-muted)]">Account
              <Select className="mt-1 h-9" defaultValue={row.accountId ?? ''}
                onChange={(e) => onChange({ accountId: e.target.value || null })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
            <label className="text-xs text-[var(--text-muted)]">Classification
              <Select className="mt-1 h-9" defaultValue={row.businessClassification}
                onChange={(e) => onChange({ businessClassification: e.target.value })}>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </Select>
            </label>
          </div>
          {row.provenance ? (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Source: {row.provenance.sourceRef ?? 'unknown'} · read as &ldquo;{row.provenance.rawDate}&rdquo; and &ldquo;{row.provenance.rawAmount}&rdquo;
              {row.provenance.typeReason ? ` · ${row.provenance.typeReason}` : ''}
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={onCloseEdit}>Done</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr
        ref={ref}
        onClick={onFocus}
        className={cn(
          'cursor-default border-b border-[var(--border)] transition-colors',
          rowTone,
          active && 'outline outline-2 -outline-offset-2 outline-[var(--accent)]',
          !rowTone && 'hover:bg-[var(--surface-2)]',
        )}
      >
        <td className="whitespace-nowrap px-3 py-2.5">
          <span className={cn('rounded px-1', lowDate && 'bg-[var(--warning-soft)] outline outline-1 outline-[var(--warning)]')}>
            {row.postedDate
              ? new Date(`${row.postedDate}T12:00:00Z`).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
              : <span className="text-[var(--negative)]">missing</span>}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className="block max-w-[30ch] truncate">{row.merchantName || row.description}</span>
          {row.validationError ? (
            <span className="text-xs text-[var(--negative)]">{row.validationError}</span>
          ) : null}
        </td>
        <td className="px-3 py-2.5 text-[var(--text-muted)]">
          {category ? (
            <span className={cn('rounded px-1', (fc.category ?? 0) < 50 && 'outline outline-1 outline-[var(--border-strong)]')}>
              {category.icon} {category.name}
            </span>
          ) : <span className="text-[var(--text-subtle)]">—</span>}
        </td>
        <td className="px-3 py-2.5">
          <Badge tone={row.type === 'income' ? 'positive' : row.type === 'transfer' ? 'info' : 'neutral'}>
            {row.type.replace('_', ' ')}
          </Badge>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className={cn('rounded px-1', lowAmount && 'bg-[var(--warning-soft)] outline outline-1 outline-[var(--warning)]')}>
            {row.amountMinor !== null
              ? <Money minor={BigInt(row.amountMinor)} currency={currency} size="sm" tone="plain" />
              : <span className="text-[var(--negative)]">missing</span>}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            {row.confidence !== null && row.confidence < LOW_CONFIDENCE ? (
              <Badge tone="warning">{row.confidence}%</Badge>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit">✎</Button>
            <Button
              size="sm"
              variant={row.status === 'accepted' ? 'primary' : 'secondary'}
              onClick={() => onStatus(row.status === 'accepted' ? 'pending' : 'accepted')}
            >
              {row.status === 'accepted' ? 'Accepted' : 'Accept'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onStatus('rejected')} aria-label="Reject">✕</Button>
          </div>
        </td>
      </tr>

      {row.duplicateScore !== null && row.duplicateScore >= 50 ? (
        <tr className="border-b border-[var(--border)] bg-[var(--warning-soft)]/40">
          <td colSpan={6} className="px-3 pb-2.5 pt-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium text-[var(--warning)]">
                {row.duplicateScore}% likely a duplicate
                {row.duplicateReasons?.scope ? ` — ${row.duplicateReasons.scope}` : ''}
              </span>
              {row.duplicateOf ? (
                <span className="text-[var(--text-muted)]">
                  matches &ldquo;{row.duplicateOf.description}&rdquo; on {row.duplicateOf.postedDate}
                </span>
              ) : null}
              {/* The reasons are shown so a merge is never a black box. */}
              <span className="text-[var(--text-subtle)]">
                {(row.duplicateReasons?.reasons ?? []).filter((r) => r.points > 0).map((r) => r.detail).join(' · ')}
              </span>
              <span className="ml-auto flex gap-1.5">
                <button type="button" onClick={() => onStatus('rejected')} className="font-medium text-[var(--text-muted)] hover:underline">Skip it</button>
                <button type="button" onClick={() => onStatus('accepted')} className="font-medium text-[var(--accent)] hover:underline">Keep both</button>
              </span>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

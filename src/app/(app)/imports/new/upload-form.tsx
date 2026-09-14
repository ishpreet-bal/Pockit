'use client';

import { useState, useRef, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, Field, Select, Button, Badge } from '@/components/ui/primitives';

interface AccountOption { id: string; name: string; type: string }

const STAGES = [
  'Uploading the file',
  'Working out what kind of file it is',
  'Reading the transactions',
  'Normalising dates and amounts',
  'Matching merchants and categories',
  'Checking for duplicates',
];

export function UploadForm({
  accounts, defaultRetention, capabilities,
}: {
  accounts: AccountOption[];
  defaultRetention: string;
  capabilities: { vision: boolean; label: string };
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');

  const accepted = capabilities.vision
    ? '.csv,.tsv,.txt,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp'
    : '.csv,.tsv,.txt,.xlsx,.xls,.pdf';

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); setError(null); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) { setError('Choose a file first.'); return; }

    setBusy(true);
    setError(null);
    setStage(0);
    // The stage list is indicative progress, not a fake progress bar: the server
    // does these steps in this order, we just cannot stream between them yet.
    const ticker = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 900);

    try {
      const form = new FormData(e.currentTarget);
      form.set('file', file);
      const res = await fetch('/api/imports/upload', { method: 'POST', body: form });
      const body = (await res.json().catch(() => null)) as
        | { importId?: string; existingImportId?: string; candidateCount?: number; error?: string }
        | null;

      if (!res.ok) throw new Error(body?.error ?? 'The file could not be processed.');
      if (body?.existingImportId) {
        router.push(`/imports/${body.existingImportId}/review`);
        return;
      }
      if (body?.candidateCount === 0) {
        setError('No transactions were found in that file. Check that it contains a transaction list rather than a summary.');
        return;
      }
      router.push(`/imports/${body!.importId}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      clearInterval(ticker);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardBody className="pt-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-strong)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <span className="text-2xl opacity-50" aria-hidden>↥</span>
            {file ? (
              <>
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(0)} KB · click to change</p>
              </>
            ) : (
              <>
                <p className="font-medium">Drop a file here, or click to choose</p>
                <p className="max-w-sm text-xs text-[var(--text-muted)]">
                  CSV, Excel, and text-based PDF statements are read on the server with no AI provider needed.
                  {capabilities.vision
                    ? ' Screenshots and scanned PDFs are read by the configured vision model.'
                    : ' Screenshots need a vision-capable AI provider, which is not configured.'}
                </p>
              </>
            )}
            <input
              ref={inputRef} type="file" name="file" accept={accepted} className="sr-only"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
            />
          </div>

          {busy ? (
            <ol className="mt-4 space-y-1.5" aria-live="polite">
              {STAGES.map((label, i) => (
                <li key={label} className={`flex items-center gap-2 text-sm ${i <= stage ? 'text-[var(--text)]' : 'text-[var(--text-subtle)]'}`}>
                  <span aria-hidden className="w-4 text-center">
                    {i < stage ? '✓' : i === stage ? (
                      <span className="inline-block h-3 w-3 animate-[pk-spin_0.8s_linear_infinite] rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                    ) : '·'}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          ) : null}

          {error ? (
            <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Settings" />
          <CardBody className="space-y-3.5">
            <Field label="Account" htmlFor="accountId" hint="Which account these transactions belong to.">
              <Select id="accountId" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                {accounts.length === 0 ? <option value="">No accounts yet</option> : null}
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>

            <Field label="Date format" htmlFor="dateFormatHint" hint="Only matters when a date could be read two ways, like 09/10.">
              <Select id="dateFormatHint" name="dateFormatHint" defaultValue="unknown">
                <option value="unknown">Detect automatically</option>
                <option value="mdy">Month / Day / Year</option>
                <option value="dmy">Day / Month / Year</option>
                <option value="ymd">Year / Month / Day</option>
              </Select>
            </Field>

            <Field label="Classify as" htmlFor="businessClassification">
              <Select id="businessClassification" name="businessClassification" defaultValue="personal">
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </Select>
            </Field>

            <Field
              label="Keep the original file?"
              htmlFor="retention"
              hint="Source files are private to your workspace and never publicly reachable."
            >
              <Select id="retention" name="retention" defaultValue={defaultRetention}>
                <option value="keep">Keep it attached</option>
                <option value="delete_after_extract">Delete it once extracted</option>
                <option value="ask">Ask me each time</option>
              </Select>
            </Field>

            <Button type="submit" variant="primary" className="w-full" disabled={busy || accounts.length === 0}>
              {busy ? 'Reading…' : 'Read this file'}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What processes your data" />
          <CardBody>
            <p className="text-sm text-[var(--text-muted)]">{capabilities.label}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="positive">CSV</Badge>
              <Badge tone="positive">Excel</Badge>
              <Badge tone="positive">Text PDF</Badge>
              <Badge tone={capabilities.vision ? 'positive' : 'neutral'}>
                Screenshots {capabilities.vision ? '' : '(needs a key)'}
              </Badge>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--text-subtle)]">
              CSV, Excel and text-based PDFs are parsed on the server and are never sent to an AI provider.
              Only images and scanned PDFs are, and only the file itself — never your existing transactions.
            </p>
          </CardBody>
        </Card>
      </div>
    </form>
  );
}

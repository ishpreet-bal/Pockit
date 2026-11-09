'use client';

import { useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';

/**
 * Whether Pock may send this person's data to the AI company. Asked the first time
 * it is needed; changed here at any time. Without a yes, Pock, receipt reading and
 * screenshot imports stay off and nothing is sent.
 */
export function AiPermission({ provider, allowed: initial }: { provider: string | null; allowed: boolean }) {
  const [allowed, setAllowed] = useState(initial);
  const [busy, setBusy] = useState(false);
  if (!provider) return null;
  async function set(allow: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/account/ai-consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allow }) });
      if (res.ok) setAllowed(((await res.json()) as { allowed: boolean }).allowed);
    } finally { setBusy(false); }
  }
  return (
    <Card>
      <CardHeader title="Pock and AI" description={`Pock's answers come from ${provider}`} />
      <CardBody className="space-y-3 text-sm text-[var(--text-muted)]">
        <p>
          {allowed
            ? `You've allowed Pockit to send your questions, the figures needed to answer them, and receipts or statements you scan to ${provider}. ${provider} doesn't use it to train its models.`
            : `Pock, receipt scanning and reading screenshots are off. Nothing is sent to ${provider}.`}
        </p>
        <button type="button" disabled={busy} onClick={() => void set(!allowed)}
          className={allowed
            ? 'rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-60'
            : 'rounded-full bg-[var(--accent-fill)] px-4 py-1.5 text-sm font-semibold text-[var(--accent-fill-fg)] hover:opacity-90 disabled:opacity-60'}>
          {busy ? 'One moment…' : allowed ? `Stop using ${provider}` : `Allow ${provider}`}
        </button>
      </CardBody>
    </Card>
  );
}

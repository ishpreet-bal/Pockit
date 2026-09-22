'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquarePlus, Check } from 'lucide-react';
import { Button, Field, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/ui/cn';

const KINDS = [
  ['confusing', 'Something confused me'],
  ['bug', 'Something is broken'],
  ['idea', 'I want something added'],
  ['praise', 'Something works well'],
  ['other', 'Something else'],
] as const;

/**
 * "Don't like something? Tell us."
 *
 * Opens from the companion rather than sitting on a settings page nobody visits
 * while annoyed. The current path is captured automatically, because "it was broken
 * on some screen" is the least useful bug report there is, and asking people to
 * remember which one spends the goodwill that made them write in.
 */
export function FeedbackForm({ onDone }: { onDone?: () => void }) {
  const pathname = usePathname();
  const [kind, setKind] = useState<string>('confusing');
  const [message, setMessage] = useState('');
  const [contactOk, setContactOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, message, page: pathname, contactOk }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) { setError(json?.error ?? 'That did not send.'); return; }
      setSent(true);
      setMessage('');
      setTimeout(() => { setSent(false); onDone?.(); }, 1800);
    } catch {
      setError('Could not reach the server. Your note is still in the box — try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm">
        <Check className="h-4 w-4 text-[var(--positive)]" />
        Sent. Thank you — this is read.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <Field label="What kind of thing?" htmlFor="fb-kind">
        <Select id="fb-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>

      <Field label="Tell us" htmlFor="fb-message">
        <textarea
          id="fb-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="What happened, or what you expected instead."
          className={cn(
            'w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--border-strong)]',
            'bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]',
            'placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none',
          )}
        />
      </Field>

      <label className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
        <input
          type="checkbox"
          checked={contactOk}
          onChange={(e) => setContactOk(e.target.checked)}
          className="mt-0.5"
        />
        You can email me about this
      </label>

      <p className="text-2xs text-[var(--text-subtle)]">
        Sent with the screen you are on. None of your transactions, balances or files are included.
      </p>

      <Button variant="primary" size="sm" disabled={busy || message.trim().length < 3} onClick={() => void send()}>
        <MessageSquarePlus className="h-3.5 w-3.5" />
        {busy ? 'Sending…' : 'Send feedback'}
      </Button>

      {error ? <p role="alert" className="text-sm text-[var(--negative)]">{error}</p> : null}
    </div>
  );
}

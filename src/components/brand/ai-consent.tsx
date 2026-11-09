'use client';

import { useState } from 'react';

/**
 * The question Apple's guideline 5.1.2(i) asks for, in plain words: which company,
 * what goes to it, and that saying no is fine. Shown the first time a question
 * would go to the AI; the server refuses until the answer is yes.
 */
export function AiConsentCard({ provider, onAllowed, onDeclined }: {
  provider: string | null;
  onAllowed: () => void;
  onDeclined?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const company = provider ?? 'an AI company';
  async function allow() {
    setBusy(true);
    try {
      const res = await fetch('/api/account/ai-consent', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allow: true }),
      });
      if (res.ok) onAllowed();
    } finally { setBusy(false); }
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--accent-ring)] bg-[var(--accent-soft)] p-4 text-sm">
      <p className="font-semibold">Pock answers using {company}.</p>
      <p className="mt-1.5 text-[var(--text-muted)]">
        To answer, Pockit sends your question and the figures it needs from your records (amounts, dates,
        categories and shop names) to {company}. Receipt photos and statements you import go there to be read.
        {' '}{company} doesn&rsquo;t use it to train its models. Your bank login and password never leave Pockit.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void allow()} disabled={busy}
          className="rounded-full bg-[var(--accent-fill)] px-4 py-1.5 text-sm font-semibold text-[var(--accent-fill-fg)] hover:opacity-90 disabled:opacity-60">
          {busy ? 'One moment…' : `Allow ${company}`}
        </button>
        {onDeclined ? (
          <button type="button" onClick={onDeclined} className="text-sm text-[var(--text-muted)] hover:underline">Not now</button>
        ) : null}
        <a href="/privacy" className="text-sm text-[var(--text-muted)] hover:underline">Privacy policy</a>
      </div>
    </div>
  );
}

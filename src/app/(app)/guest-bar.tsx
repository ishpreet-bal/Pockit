'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';

/**
 * Always visible while a guest looks around: whose money this is (nobody's), and
 * the way to make it real. Creating an account throws the sample money away, so
 * the person's own numbers start clean.
 */
export function GuestBar() {
  const [busy, setBusy] = useState(false);

  async function createAccount() {
    setBusy(true);
    try {
      await fetch('/api/account/guest/end', { method: 'POST' });
    } finally {
      window.location.assign('/sign-up');
    }
  }

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--accent-ring)] bg-[var(--accent-soft)] px-4 py-2 text-sm">
      <p className="min-w-0 flex-1">
        <strong>You&rsquo;re looking around with sample money.</strong>{' '}
        <span className="text-[var(--text-muted)]">Tap anything. When you&rsquo;re ready, make it yours.</span>
      </p>
      <button
        type="button"
        onClick={() => void createAccount()}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-fill)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-fill-fg)] hover:opacity-90 disabled:opacity-60"
      >
        <UserPlus className="h-3.5 w-3.5" />
        {busy ? 'One moment…' : 'Create my account'}
      </button>
    </div>
  );
}

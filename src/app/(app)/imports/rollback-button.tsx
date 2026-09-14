'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Undo an entire import (spec §26). Confirmation is required because it removes
 * transactions, and the copy states exactly how many.
 */
export function RollbackButton({ importId, count }: { importId: string; count: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function rollback() {
    setBusy(true);
    try {
      const res = await fetch(`/api/imports/${importId}/rollback`, { method: 'POST' });
      if (res.ok) startTransition(() => router.refresh());
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--negative)] hover:underline"
      >
        Undo
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-[var(--text-muted)]">Remove {count}?</span>
      <button type="button" onClick={() => void rollback()} disabled={busy}
        className="font-medium text-[var(--negative)] hover:underline">
        {busy ? '…' : 'Yes'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-[var(--text-subtle)] hover:underline">
        No
      </button>
    </span>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, X } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

/**
 * A standing reminder that what you are looking at is not yours.
 *
 * Loading the sample used to be a one-way door: it filled the workspace, and the way
 * back out was a destructive control on the settings page that talks about erasing
 * everything — which is alarming language for deleting data you never entered. This
 * says plainly what is loaded and offers the one button that matters.
 */
export function DemoBanner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace/clear-demo', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not clear the demo data.');
      }
      router.push('/overview');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    // One line, not a paragraph. On a phone the old version was taller than the
    // number it sat above, which is backwards for a notice that means "not yours".
    <div className="mb-4 flex items-center gap-2.5 rounded-full border border-[var(--warning)]/30 bg-[var(--warning-soft)] py-1.5 pl-3.5 pr-1.5">
      <FlaskConical className="h-4 w-4 shrink-0 text-[var(--warning)]" strokeWidth={2.1} />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold">Sample data</span>
        <span className="hidden text-[var(--text-muted)] sm:inline"> — not your real money</span>
        {error ? <span className="ml-2 text-xs text-[var(--negative)]">{error}</span> : null}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="primary" className="rounded-full" disabled={busy} onClick={() => void clear()}>
          {busy ? 'Clearing…' : 'Start fresh'}
        </Button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Hide this notice"
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

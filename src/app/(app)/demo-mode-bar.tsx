'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Mascot } from '@/components/brand/mascot';

/**
 * Always visible while exploring the demo, so there is never a moment of "is this
 * my data?" — and never a moment of "how do I get out?". Leaving takes one tap and
 * returns to exactly the workspace the person came from.
 */
export function DemoModeBar() {
  const [leaving, setLeaving] = useState(false);

  async function exit() {
    setLeaving(true);
    try {
      await fetch('/api/demo/exit', { method: 'POST' });
      // A full navigation, not a client push. Switching workspace changes what
      // every server component renders, and a soft push to the page we are already
      // on is a no-op — which left people staring at the demo after pressing Exit.
      window.location.assign('/overview');
    } catch {
      setLeaving(false);
    }
  }

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--accent-ring)] bg-[var(--accent-soft)] px-4 py-2 text-sm">
      <Mascot mood="happy" className="h-7 w-7 shrink-0" />
      <p className="min-w-0 flex-1">
        <strong>You&rsquo;re exploring the demo.</strong>{' '}
        <span className="text-[var(--text-muted)]">Look around freely — none of this is your data, and nothing here affects your account.</span>
      </p>
      <button
        type="button"
        onClick={() => void exit()}
        disabled={leaving}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-fill)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-fill-fg)] hover:-translate-y-px disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" />
        {leaving ? 'Leaving…' : 'Exit demo'}
      </button>
    </div>
  );
}

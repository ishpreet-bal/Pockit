'use client';

import { MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

/**
 * "Ask Pock about this goal."
 *
 * The point is that the question arrives already knowing its subject. Clicking this
 * on a goal should not lead to Pock asking which goal — the person already answered
 * that by clicking, and asking again is the assistant admitting it was not paying
 * attention.
 *
 * The anchor travels through a custom event rather than a route, so the panel opens
 * over whatever the person was reading instead of navigating them away from it.
 */
export function AskPockButton({
  anchor, label, prompt, className,
}: {
  anchor: { kind: 'goal' | 'symbol' | 'budget' | 'spending'; id?: string; label?: string };
  label: string;
  /** Prefilled question. Left editable, because the suggested one is often not theirs. */
  prompt?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('pock:ask', { detail: { anchor, prompt } }));
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium',
        'text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]',
        className,
      )}
    >
      <MessageCircleQuestion className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

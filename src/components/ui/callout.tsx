import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

type Tone = 'tip' | 'attention' | 'bill' | 'goal';

const TONES: Record<Tone, { wrap: string; icon: string; label: string }> = {
  tip: { wrap: 'bg-[var(--info-soft)] border-[var(--info)]/20 text-[var(--text)]', icon: '💡', label: 'Tip' },
  attention: { wrap: 'bg-[var(--negative-soft)] border-[var(--negative)]/20 text-[var(--text)]', icon: '⚠️', label: 'Heads up' },
  bill: { wrap: 'bg-[var(--warning-soft)] border-[var(--warning)]/25 text-[var(--text)]', icon: '📅', label: 'Coming up' },
  goal: { wrap: 'bg-[var(--goal-soft)] border-[var(--goal)]/20 text-[var(--text)]', icon: '🎯', label: 'Goal' },
};

/**
 * A finding, phrased the way a person would say it.
 *
 * The app used to put raw arithmetic in front of people — "Available monthly:
 * -$366.60" — which states a fact and leaves them to work out both what it means and
 * what to do. Every callout here carries the number, the plain-language consequence,
 * and, where one exists, the single action that changes it.
 *
 * `action` is deliberately singular. Two suggested actions is a decision the person
 * now has to make before they can act at all.
 */
export function Callout({
  tone = 'tip',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={cn('rounded-[var(--radius-card)] border px-4 py-3.5', t.wrap, className)}>
      <div className="flex gap-3">
        <span aria-hidden className="text-base leading-6">{t.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed">
            {title ? <span className="font-semibold">{title} </span> : <span className="sr-only">{t.label}: </span>}
            {children}
          </p>
          {action ? (
            <Link
              href={action.href}
              className="mt-1.5 inline-block text-sm font-semibold text-[var(--accent)] hover:underline"
            >
              {action.label} →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

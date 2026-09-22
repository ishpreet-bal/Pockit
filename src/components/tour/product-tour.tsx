'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/primitives';
import { Mascot } from '@/components/brand/mascot';
import { Tour, type TourStep } from './tour';

/**
 * Seven steps, and not one more.
 *
 * The temptation with a tour is to explain everything, which produces a tour nobody
 * finishes and therefore explains nothing. These are the places someone needs to
 * know exist; everything else they will find when they need it.
 *
 * Targets are `data-tour` hooks on the real navigation, so the spotlight lands on
 * the actual element at whatever size the window happens to be. The sidebar is not
 * rendered on a phone, so those steps resolve against the mobile tab bar instead —
 * both carry the same hook, and the tour skips any that are genuinely absent.
 */
const STEPS: TourStep[] = [
  {
    target: '[data-tour="nav-overview"]',
    title: 'Your financial home',
    body: 'What came in, what is going out, and what still needs paying this month.',
    prefer: 'right',
  },
  {
    target: '[data-tour="nav-transactions"]',
    title: 'Everything in one place',
    body: 'Add things as they happen, or import a statement and Pockit will sort them into categories.',
    prefer: 'right',
  },
  {
    target: '[data-tour="nav-budget"]',
    title: 'Give your money a plan',
    body: 'Set what you mean to spend per category, and see how the month is actually going against it.',
    prefer: 'right',
  },
  {
    target: '[data-tour="nav-goals"]',
    title: 'Turn plans into progress',
    body: 'Pockit works out what each goal needs per month and tells you honestly whether your cash flow covers it.',
    prefer: 'right',
  },
  {
    target: '[data-tour="nav-calendar"]',
    title: 'See what lands when',
    body: 'Bills and pay laid out by date, so you can tell whether money arrives before it leaves.',
    prefer: 'right',
  },
  {
    target: '[data-tour="quick-add"]',
    title: 'Add anything, quickly',
    body: 'This button adds a transaction from wherever you are.',
    prefer: 'left',
  },
  {
    target: '[data-tour="pock"]',
    title: 'Whenever you are unsure, ask Pock',
    body: 'Pock knows how Pockit works and can see your own numbers. "Why is my available negative?" is a fair question to ask it.',
    prefer: 'left',
  },
];

type Phase = 'hidden' | 'offer' | 'running' | 'finished';

/**
 * Offers the tour, runs it, and remembers the answer on the server.
 *
 * Shown when onboarding hands over with `?tour=offer`. Declining is recorded the
 * same way finishing is, so it is never offered twice — an invitation that keeps
 * coming back is a nag.
 */
export function ProductTour({ alreadyDone }: { alreadyDone: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const offered = params.get('tour') === 'offer';
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
    if (offered && !alreadyDone) setPhase('offer');
  }, [offered, alreadyDone]);

  async function record() {
    try {
      await fetch('/api/onboarding/state', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourCompleted: true }),
      });
    } catch {
      // Not worth interrupting anyone over. The worst case is being offered once more.
    }
    // Drop the query parameter so a refresh does not re-offer.
    router.replace('/overview');
  }

  if (phase === 'hidden') return null;

  if (phase === 'offer') {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)] sm:inset-x-auto sm:right-6">
        <div className="flex items-start gap-3">
          <Mascot mood="idle" className="h-9 w-9 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Want the 60-second tour?</p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Six stops, and you can leave at any point.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" onClick={() => setPhase('running')}>Show me around</Button>
          <Button size="sm" variant="ghost" onClick={() => { setPhase('hidden'); void record(); }}>
            I&rsquo;ve got it
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'running') {
    return (
      <Tour
        steps={STEPS}
        onFinish={(completed) => {
          setPhase(completed ? 'finished' : 'hidden');
          void record();
        }}
      />
    );
  }

  // The last word belongs to Pock, which is the point of the whole flow: the guide
  // does not stop when the tour does.
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)] sm:inset-x-auto sm:right-6">
      <div className="flex items-start gap-3">
        <Mascot mood="happy" className="h-9 w-9 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">That&rsquo;s the basics.</p>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            If you ever get stuck, ask Pock — bottom right, always there.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setPhase('hidden');
            // Opens the companion's assistant panel wherever it is on screen.
            document.querySelector<HTMLButtonElement>('[data-tour="pock"]')?.click();
          }}
        >
          Ask Pock
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPhase('hidden')}>Start exploring</Button>
      </div>
    </div>
  );
}

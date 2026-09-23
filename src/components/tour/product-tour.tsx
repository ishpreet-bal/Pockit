'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/primitives';
import { Mascot } from '@/components/brand/mascot';
import { Tour, type TourStep } from './tour';
import { tourForPath } from './page-tours';

/**
 * The short tour of the whole app. Five stops, opening with a welcome card so the
 * first thing a new person sees is Pock explaining what is about to happen — not a
 * dashboard they are left to decode.
 */
function mainSteps(name: string | null): TourStep[] {
  return [
    {
      title: name ? `Welcome in, ${name}.` : 'Welcome in.',
      body: 'Pockit is three things: what you can spend, where it went, and what you\u2019re saving for. Four quick stops — skip whenever you like.',
    },
    { target: '[data-tour="nav-overview"]', title: 'Home', body: 'One number — what\u2019s safe to spend — and the bills coming up next.', prefer: 'right' },
    { target: '[data-tour="nav-transactions"]', title: 'Spending', body: 'Everything you\u2019ve spent, and how the month compares to your budget.', prefer: 'right' },
    { target: '[data-tour="nav-goals"]', title: 'Goals', body: 'What you\u2019re saving for, and whether you\u2019re on track.', prefer: 'right' },
    { target: '[data-tour="pock"]', title: 'Stuck? Ask me.', body: 'Tap me any time. I know how Pockit works and I can see your numbers.', prefer: 'left' },
  ];
}

type Phase = 'hidden' | 'main' | 'finished' | 'page';

export function ProductTour({ alreadyDone, name }: { alreadyDone: boolean; name: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>('hidden');
  const [pageSteps, setPageSteps] = useState<TourStep[] | null>(null);

  // Arriving from setup starts the tour straight away. Offering it in a corner
  // left people on an unfamiliar dashboard deciding whether they needed help,
  // which is the moment they most need it. Skip is on every step.
  const wantsStart = params.get('tour') === 'start' || params.get('tour') === 'offer';
  useEffect(() => {
    if (wantsStart && !alreadyDone) {
      const t = setTimeout(() => setPhase('main'), 900); // let the page finish arriving
      return () => clearTimeout(t);
    }
  }, [wantsStart, alreadyDone]);

  // "Explore this page", from Pock's menu.
  const explore = useCallback(() => {
    const tour = tourForPath(pathname);
    if (!tour) return;
    setPageSteps(tour.steps);
    setPhase('page');
  }, [pathname]);

  useEffect(() => {
    window.addEventListener('pock:explore', explore);
    return () => window.removeEventListener('pock:explore', explore);
  }, [explore]);

  // Replaying the main tour on request, from Pock's menu.
  useEffect(() => {
    const replay = () => setPhase('main');
    window.addEventListener('pock:tour', replay);
    return () => window.removeEventListener('pock:tour', replay);
  }, []);

  async function recordMain() {
    try {
      await fetch('/api/onboarding/state', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourCompleted: true }),
      });
    } catch { /* worst case: offered once more */ }
    if (wantsStart) router.replace(pathname);
  }

  if (phase === 'main') {
    return (
      <Tour
        steps={mainSteps(name)}
        onFinish={(completed) => {
          setPhase(completed ? 'finished' : 'hidden');
          void recordMain();
        }}
      />
    );
  }

  if (phase === 'page' && pageSteps) {
    return <Tour steps={pageSteps} onFinish={() => { setPhase('hidden'); markExplored(pathname); }} />;
  }

  if (phase === 'finished') {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)] sm:inset-x-auto sm:right-6">
        <div className="flex items-start gap-3">
          <Mascot mood="celebrating" className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">That&rsquo;s the basics.</p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Still a bit unsure? Explore a demo account full of example data — nothing you do there touches yours.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/demo"
            className="inline-flex h-8 items-center rounded-[var(--radius-control)] bg-[var(--accent-fill)] px-3 text-xs font-semibold text-[var(--accent-fill-fg)]"
          >
            Explore the demo
          </a>
          <Button
            size="sm"
            onClick={() => {
              setPhase('hidden');
              document.querySelector<HTMLButtonElement>('[data-tour="pock"]')?.click();
            }}
          >
            Ask Pock
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPhase('hidden')}>I&rsquo;m good</Button>
        </div>
      </div>
    );
  }

  return null;
}

/* ---------------- remembering what was explored ---------------- */

const SEEN_KEY = 'pockit-explored';

function markExplored(pathname: string) {
  const tour = tourForPath(pathname);
  if (!tour) return;
  try {
    const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
    seen.add(tour.prefix);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch { /* private mode */ }
}


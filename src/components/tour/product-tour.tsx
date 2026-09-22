'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Compass, X } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { Mascot } from '@/components/brand/mascot';
import { Tour, type TourStep } from './tour';
import { tourForPath } from './page-tours';

/**
 * The short tour of the whole app. Seven stops, opening with a welcome card so the
 * first thing a new person sees is Pock explaining what is about to happen — not a
 * dashboard they are left to decode.
 */
function mainSteps(name: string | null): TourStep[] {
  return [
    {
      title: name ? `Welcome in, ${name}.` : 'Welcome in.',
      body: 'Here’s a 60-second look around so nothing feels unfamiliar. Skip whenever you like — you can replay it from Pock any time.',
    },
    { target: '[data-tour="nav-overview"]', title: 'Your financial home', body: 'What came in, what is going out, and what still needs paying this month.', prefer: 'right' },
    { target: '[data-tour="nav-transactions"]', title: 'Everything in one place', body: 'Add spending as it happens, or import a bank statement and Pockit sorts it into categories.', prefer: 'right' },
    { target: '[data-tour="nav-budget"]', title: 'Give your money a plan', body: 'Decide what each category gets, and see how the month is going against it.', prefer: 'right' },
    { target: '[data-tour="nav-goals"]', title: 'Turn plans into progress', body: 'Pockit works out what each goal needs a month — and tells you honestly whether your money covers it.', prefer: 'right' },
    { target: '[data-tour="quick-add"]', title: 'Add anything, from anywhere', body: 'This button adds a transaction without leaving the page you are on.', prefer: 'left' },
    { target: '[data-tour="pock"]', title: 'And whenever you’re unsure, ask me', body: 'I know how Pockit works and I can see your numbers. Every page also has its own walkthrough — look for “Explore this page” in my menu.', prefer: 'left' },
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

  // "Explore this page", from Pock's menu or the nudge below.
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

  return <ExploreNudge pathname={pathname} onExplore={explore} />;
}

/* ---------------- the per-page nudge ---------------- */

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

/**
 * The first time someone opens a section, a small pill offers its walkthrough.
 *
 * Once per section, and gone for good after it is used or dismissed. Offering on
 * every visit would turn a helpful hint into furniture people learn to ignore.
 */
function ExploreNudge({ pathname, onExplore }: { pathname: string; onExplore: () => void }) {
  const tour = tourForPath(pathname);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!tour) { setVisible(false); return; }
    try {
      const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
      if (seen.has(tour.prefix)) { setVisible(false); return; }
    } catch { /* show it */ }
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [tour]);

  if (!tour) return null;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] py-1 pl-1 pr-1.5 shadow-[var(--shadow-lg)] md:bottom-6"
        >
          <button
            type="button"
            onClick={() => { setVisible(false); onExplore(); }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
          >
            <Compass className="h-3.5 w-3.5" />
            New to {tour.label}? Explore this page
          </button>
          <button
            type="button"
            aria-label="No thanks"
            onClick={() => { setVisible(false); markExplored(pathname); }}
            className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

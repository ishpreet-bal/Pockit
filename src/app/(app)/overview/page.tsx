import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { holdings, watchlistItems } from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { buildOverview } from '@/lib/finance/view/overview';
import { Card, CardBody, LinkButton, ProgressBar } from '@/components/ui/primitives';
import { Callout } from '@/components/ui/callout';
import { Money } from '@/components/finance/money';
import { SeedDemoButton } from './seed-demo';
import { DemoBanner } from '../demo-banner';
import { isDemoTour } from '@/lib/data/demo-workspace';
import { Hero } from './hero';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

/** Page gutters, one definition. Matches the max-w-7xl shell in the app layout. */
const GUTTER = 'px-4 sm:px-6 lg:px-8';

export default async function OverviewPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const d = await buildOverview(repo, user.timezone, user.locale);
  const cur = d.currency;
  const firstName = user.displayName?.split(' ')[0];

  if (!d.hasTransactions && !d.hasRecurring) {
    return (
      <div className={cn('mx-auto max-w-2xl py-8', GUTTER)}>
        <h1 className="text-2xl font-semibold tracking-tight">
          {firstName ? `Welcome, ${firstName}` : 'Welcome to Pockit'}
        </h1>
        <Card className="mt-5">
          <CardBody className="pt-6">
            <h2 className="text-lg font-semibold">Let&rsquo;s get you a picture of your money</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              You don&rsquo;t need months of history. Start with whichever of these is easiest — the
              dashboard fills in as you go.
            </p>
            <ul className="mt-4 space-y-2.5">
              {[
                { title: 'Add the bills you already know about', body: 'Rent, phone, subscriptions. Takes a minute and immediately shows what is coming.', href: '/recurring', cta: 'Add a recurring bill', primary: true },
                { title: 'Add a transaction', body: 'Anything you spent recently.', href: '/transactions', cta: 'Go to transactions' },
                { title: 'Import a statement', body: 'CSV, Excel or PDF from your bank.', href: '/imports/new', cta: 'Import a file' },
              ].map((step) => (
                <li key={step.href} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{step.body}</p>
                  </div>
                  <LinkButton href={step.href} variant={step.primary ? 'primary' : 'secondary'} size="sm">
                    {step.cta}
                  </LinkButton>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-3 border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--text-muted)]">Just want to look around first?</p>
              <SeedDemoButton />
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const monthLabel = new Date(`${d.period.start}T12:00:00Z`)
    .toLocaleDateString(user.locale, { month: 'long', timeZone: 'UTC' });

  // Investing is surfaced on Home rather than buried in More, but cheaply: counts
  // and symbols from our own tables, no market calls. A live price here would spend
  // the market-data quota on every visit to the most-visited page in the app.
  const [held, watched] = await Promise.all([
    withUser(user.id, (tx) => tx.select({ symbol: holdings.symbol }).from(holdings).where(eq(holdings.workspaceId, workspace.id))),
    withUser(user.id, (tx) => tx.select({ symbol: watchlistItems.symbol }).from(watchlistItems).where(eq(watchlistItems.workspaceId, workspace.id)).limit(4)),
  ]);

  const upcoming = d.upcoming.slice(0, 3);
  const topGoal = d.goalStatus[0] ?? null;

  /*
    Home answers four questions and nothing else:

      How much can I spend?        -> the hero
      What is about to leave?      -> coming up, three items
      Am I getting anywhere?       -> the goal nearest the top
      What about investing?        -> one card

    Everything that used to be here — four stat tiles, the spending donut, recent
    activity, the budget card, "worth knowing" — is still in Pockit, on the
    Spending tab. People who tried the old Home said they would not use it because
    there was too much going on, and a home screen that needs a tour is failing at
    the one job it has.
  */
  return (
    <div className={cn('mx-auto max-w-2xl space-y-7 py-6 sm:py-8', GUTTER)}>
      {workspace.isDemo && !isDemoTour(workspace) ? <DemoBanner /> : null}

      <section aria-label="Where you stand">
        <Hero
          greeting={firstName ? `Hi ${firstName}` : 'Hi there'}
          datePill={`${d.position.daysLeftInPeriod} days left in ${monthLabel}`}
          label="Safe to spend"
          amountMinor={Number(d.available.amountMinor)}
          currency={cur}
          explanation={d.available.explanation}
          action={d.available.action}
          tone={d.available.tone === 'attention' ? 'attention' : 'ok'}
        />
      </section>

      {d.leftThisPeriod.amountMinor < 0n ? (
        <Callout tone="attention" title="Heads up — this month is running short.">
          At this pace you&rsquo;ll be about <strong>{formatMoney(-d.leftThisPeriod.amountMinor, cur)}</strong> short
          by the end of {monthLabel}. Nothing has gone wrong yet.
        </Callout>
      ) : null}

      <section aria-label="Coming up">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Coming up</h2>
          <Link href="/recurring" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent)] hover:underline">
            All bills <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {upcoming.length > 0 ? (
          <Card className="overflow-hidden">
            <ul>
              {upcoming.map((item, i) => {
                const days = daysUntil(item.date, d.today);
                return (
                  <li key={`${item.name}-${item.date}-${i}`}
                    className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {days === null ? '' : days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : new Date(`${item.date}T12:00:00Z`).toLocaleDateString(user.locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      </p>
                    </div>
                    <Money minor={-item.amountMinor} currency={cur} size="sm" />
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card>
            <CardBody className="flex items-center justify-between gap-3 py-4">
              <p className="text-sm text-[var(--text-muted)]">No bills added yet.</p>
              <LinkButton href="/recurring" size="sm">Add a bill</LinkButton>
            </CardBody>
          </Card>
        )}
        {d.nextIncome ? (
          <p className="mt-2 text-xs text-[var(--text-subtle)]">
            Next money in: {d.nextIncome.name}, {formatMoney(d.nextIncome.amountMinor, cur)} on{' '}
            {new Date(`${d.nextIncome.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })}.
          </p>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/goals" className="block" aria-label="Goals">
          <Card interactive className="h-full p-4">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-subtle)]">Goals</p>
            {topGoal ? (
              <>
                <p className="mt-2 truncate text-sm font-semibold">{topGoal.goal.name}</p>
                <ProgressBar fraction={topGoal.math.progressFraction} tone="goal" className="mt-2" />
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  {formatMoney(topGoal.goal.currentMinor, cur, { compact: true })} of{' '}
                  {formatMoney(topGoal.goal.targetMinor, cur, { compact: true })}
                  {d.goalStatus.length > 1 ? ` · +${d.goalStatus.length - 1} more` : ''}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">Saving for something? Set a goal and Pockit tracks it.</p>
            )}
          </Card>
        </Link>

        <Link href="/investing" className="block" aria-label="Investing">
          <Card interactive className="h-full p-4">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-subtle)]">Investing</p>
            {held.length > 0 || watched.length > 0 ? (
              <>
                <p className="mt-2 text-sm font-semibold">
                  {held.length > 0
                    ? `${held.length} investment${held.length === 1 ? '' : 's'}`
                    : `Following ${watched.length}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...held, ...watched].slice(0, 4).map((h, i) => (
                    <span key={`${h.symbol}-${i}`} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-2xs font-semibold">
                      {h.symbol}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">Explore stocks and funds, and follow the ones you like.</p>
            )}
          </Card>
        </Link>
      </div>
    </div>
  );
}

function daysUntil(iso: string, today: string): number | null {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

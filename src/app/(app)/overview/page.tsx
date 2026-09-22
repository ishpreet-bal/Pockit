import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { buildOverview } from '@/lib/finance/view/overview';
import { Card, CardBody, EmptyState, LinkButton, ProgressBar } from '@/components/ui/primitives';
import { Callout } from '@/components/ui/callout';
import { Money } from '@/components/finance/money';
import { SeedDemoButton } from './seed-demo';
import { DemoBanner } from '../demo-banner';
import { isDemoTour } from '@/lib/data/demo-workspace';
import { Hero } from './hero';
import { StatGrid, type Stat } from './stat-grid';
import { SpendingDonut } from './spending-donut';
import { RecentActivity } from './recent-activity';
import { formatMoney } from '@/lib/money';
import { SOFT_PULSE } from '@/components/ui/motion';
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

  const spentDelta = d.spentDeltaMinor;
  const stats: Stat[] = [
    {
      key: 'in',
      label: 'Came in',
      amountMinor: Number(d.incomeReceived),
      tone: 'in',
      note: d.incomeExpected > 0n ? `${formatMoney(d.incomeExpected, cur)} still expected` : undefined,
    },
    {
      key: 'spent',
      label: 'Spent',
      amountMinor: Number(d.spent),
      href: '/transactions',
      // Spending more than last month is the bad direction, so the arrow and the
      // colour have to agree on that — an up arrow in green here would read as praise.
      trend: spentDelta !== null && spentDelta !== 0n ? {
        direction: spentDelta > 0n ? 'up' : 'down',
        label: formatMoney(spentDelta < 0n ? -spentDelta : spentDelta, cur, { compact: true }),
        isGood: spentDelta < 0n,
      } : undefined,
      note: spentDelta === null ? 'no comparison yet' : undefined,
    },
    {
      key: 'due',
      label: 'Still to pay',
      amountMinor: Number(d.dueThisPeriodTotal),
      tone: 'bill',
      href: '/transactions?view=upcoming',
      note: d.dueThisPeriodCount > 0
        ? `${d.dueThisPeriodCount} bill${d.dueThisPeriodCount === 1 ? '' : 's'} this month`
        : 'nothing left this month',
    },
    {
      key: 'left',
      label: d.leftThisPeriod.label,
      amountMinor: Number(d.leftThisPeriod.amountMinor),
      tone: d.leftThisPeriod.amountMinor < 0n ? 'attention' : 'plain',
      note: 'income less spending and bills',
    },
  ];

  const donutSlices = d.topCategories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    amountMinor: Number(c.amountMinor),
    shareOfSpend: c.shareOfSpend,
  }));

  const recentItems = d.recent.map((t) => ({
    id: t.id,
    description: t.description,
    date: t.date,
    categoryName: t.categoryName,
    categoryIcon: t.categoryIcon,
    signedMinor: Number(
      t.type === 'income' || t.type === 'refund' ? d.absMinor(t.amountMinor) : -d.absMinor(t.amountMinor),
    ),
    bucket: t.bucket,
  }));

  return (
    <div className={cn('space-y-8 py-6 sm:py-8', GUTTER)}>
      {/* The demo sandbox has its own bar with an Exit; this banner's "clear it" would
              empty the sandbox, which is never what someone exploring it wants. */}
          {workspace.isDemo && !isDemoTour(workspace) ? <DemoBanner /> : null}

      <section aria-label="Where you stand">
        <Hero
          greeting={firstName ? `Hello, ${firstName}` : 'Your money'}
          datePill={`${monthLabel} · ${d.position.daysLeftInPeriod} days left`}
          label={d.available.label}
          amountMinor={Number(d.available.amountMinor)}
          currency={cur}
          explanation={d.available.explanation}
          action={d.available.action}
          tone={d.available.tone === 'attention' ? 'attention' : 'ok'}
        />
        <div className="mt-6">
          <StatGrid stats={stats} currency={cur} />
        </div>
      </section>

      {/* The one figure most likely to worry someone, said out loud rather than left
          as a minus sign for them to interpret. */}
      {d.leftThisPeriod.amountMinor < 0n ? (
        <Callout tone="attention" title="You&rsquo;re projected to overspend this month.">
          Your income for {monthLabel} does not cover what you have already spent plus the bills
          still to come — you are{' '}
          <strong>{formatMoney(-d.leftThisPeriod.amountMinor, cur)}</strong> short. Nothing has gone
          wrong yet; this is what the month looks like if it carries on as it is.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Coming up sits first because it is the only thing on this page you can
            act on today. */}
        <section aria-label="Coming up" className="lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              Coming up
              <span className="ml-1.5 text-xs font-normal text-[var(--text-subtle)]">
                next {d.lookaheadDays} days
              </span>
            </h2>
            <Link href="/calendar" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent)] hover:underline">
              Calendar <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {d.upcoming.length > 0 ? (
            <Card className="overflow-hidden">
              <ul>
                {d.upcoming.map((item, i) => {
                  const days = daysUntil(item.date, d.today);
                  return (
                    <li key={`${item.name}-${item.date}-${i}`}
                      className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0">
                      <div className="w-11 shrink-0 rounded-[var(--radius-control)] bg-[var(--warning-soft)] py-1 text-center">
                        <div className="text-2xs uppercase text-[var(--warning)]">
                          {new Date(`${item.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', timeZone: 'UTC' })}
                        </div>
                        <div className="tabular text-sm font-semibold text-[var(--warning)]">
                          {Number(item.date.slice(8, 10))}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {item.origin === 'recurring' ? 'repeats' : 'scheduled by you'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Money minor={-item.amountMinor} currency={cur} size="sm" />
                        {days !== null && days <= 3 ? (
                          <span className={cn(
                            'mt-0.5 block rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-2xs font-medium text-[var(--warning)]',
                            SOFT_PULSE,
                          )}>
                            {days <= 0 ? 'due today' : days === 1 ? 'tomorrow' : `in ${days} days`}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="Nothing scheduled"
                description="Add the bills you already know about and Pockit will subtract them from what you have available."
                action={<LinkButton href="/recurring" variant="primary">Add a recurring bill</LinkButton>}
              />
            </Card>
          )}
          {d.commitmentCount > d.upcomingShown ? (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Showing {d.upcomingShown} of {d.commitmentCount} in the next {d.lookaheadDays} days,
              worth {formatMoney(d.upcomingTotal, cur)}.{' '}
              <Link href="/calendar" className="font-medium text-[var(--accent)] hover:underline">See them all</Link>
            </p>
          ) : null}
          {d.nextIncome ? (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Next money in: {d.nextIncome.name}, {formatMoney(d.nextIncome.amountMinor, cur)} on{' '}
              {new Date(`${d.nextIncome.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })}.
            </p>
          ) : null}
        </section>

        <section aria-label="Where your money went" className="lg:col-span-3">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Where it went</h2>
            <Link href="/analytics" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent)] hover:underline">
              Details <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {donutSlices.length > 0 ? (
            <Card>
              <CardBody className="pt-5">
                <SpendingDonut slices={donutSlices} totalMinor={Number(d.spent)} currency={cur} />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="Nothing spent yet this month"
                description="Your spending will break down by category here as transactions come in."
                action={<LinkButton href="/transactions">Add a transaction</LinkButton>}
              />
            </Card>
          )}
        </section>
      </div>

      {(d.budgetStatus || d.goalStatus.length > 0) ? (
        <section aria-label="On track">
          <h2 className="mb-3 text-base font-semibold">On track?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {d.budgetStatus ? (
              <Link href="/budget" className="block">
                <Card interactive className="h-full p-4">
                  <p className="text-sm font-medium text-[var(--text-muted)]">Budget</p>
                  <p className="mt-1">
                    <Money minor={d.budgetStatus.totalSpentMinor} currency={cur} size="lg" tone="plain" />
                    <span className="text-sm text-[var(--text-muted)]">
                      {' '}of {formatMoney(d.budgetStatus.totalTargetMinor, cur)}
                    </span>
                  </p>
                  <ProgressBar
                    className="mt-2.5"
                    fraction={d.budgetStatus.totalTargetMinor > 0n
                      ? Number(d.budgetStatus.totalSpentMinor) / Number(d.budgetStatus.totalTargetMinor) : 0}
                    markerFraction={d.budgetStatus.elapsedFraction}
                    tone={d.budgetStatus.totalRemainingMinor < 0n ? 'negative' : 'accent'}
                  />
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    {d.budgetStatus.warnings[0]?.message
                      ?? `${formatMoney(d.budgetStatus.totalRemainingMinor, cur)} left with ${d.budgetStatus.daysRemaining} days to go.`}
                  </p>
                </Card>
              </Link>
            ) : (
              <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] p-4">
                <p className="text-sm font-medium">No budget yet</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Pockit can suggest one from your income and bills — you don&rsquo;t have to fill in blanks.
                </p>
                <LinkButton href="/budget" size="sm" variant="primary" className="mt-2.5">Set up a budget</LinkButton>
              </div>
            )}

            {d.goalStatus.length > 0 ? (
              <Link href="/goals" className="block">
                <Card interactive className="h-full p-4">
                  <p className="text-sm font-medium text-[var(--text-muted)]">Goals</p>
                  <div className="mt-2 space-y-3">
                    {d.goalStatus.map(({ goal, math }) => (
                      <div key={goal.id}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{goal.name}</span>
                          <span className="tabular text-xs text-[var(--text-muted)]">
                            {Math.round(math.progressFraction * 100)}%
                          </span>
                        </div>
                        <ProgressBar fraction={math.progressFraction} tone="goal" className="mt-1.5" />
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">
                          {formatMoney(goal.currentMinor, cur, { compact: true })} of{' '}
                          {formatMoney(goal.targetMinor, cur, { compact: true })}
                          {math.requiredMonthlyMinor !== null ? ` · ${formatMoney(math.requiredMonthlyMinor, cur)}/mo to stay on track` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              </Link>
            ) : (
              <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] p-4">
                <p className="text-sm font-medium">No savings goal yet</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Set a target and Pockit works out what to put aside each month.
                </p>
                <LinkButton href="/goals" size="sm" className="mt-2.5">Add a goal</LinkButton>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {d.insights.length > 0 ? (
        <section aria-label="Worth knowing">
          <h2 className="mb-3 text-base font-semibold">Worth knowing</h2>
          <div className="space-y-2">
            {d.insights.map((i) => (
              <Callout
                key={i.dedupeKey}
                tone={i.severity === 'attention' ? 'attention' : i.severity === 'notice' ? 'bill' : 'tip'}
              >
                {i.headline}
                {i.detail ? <span className="text-[var(--text-muted)]"> {i.detail}</span> : null}
              </Callout>
            ))}
          </div>
        </section>
      ) : null}

      {recentItems.length > 0 ? (
        <section aria-label="Recent activity">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Recent</h2>
            <Link href="/transactions" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent)] hover:underline">
              All transactions <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <RecentActivity items={recentItems} currency={cur} locale={user.locale} />
        </section>
      ) : null}
    </div>
  );
}

/** Whole days from today to an ISO date, or null if the date is unparseable. */
function daysUntil(iso: string, today: string): number | null {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { buildOverview } from '@/lib/finance/view/overview';
import { PageHeader } from '../page-header';
import { Card, CardBody, EmptyState, LinkButton, ProgressBar } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { SeedDemoButton } from './seed-demo';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const d = await buildOverview(repo, user.timezone, user.locale);
  const cur = d.currency;
  const firstName = user.displayName?.split(' ')[0];

  if (!d.hasTransactions && !d.hasRecurring) {
    return (
      <>
        <PageHeader title={firstName ? `Welcome, ${firstName}` : 'Welcome to Pockit'} />
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <Card>
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
      </>
    );
  }

  const monthLabel = new Date(`${d.period.start}T12:00:00Z`)
    .toLocaleDateString(user.locale, { month: 'long', timeZone: 'UTC' });

  return (
    <>
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : 'Your money'}
        description={`${monthLabel} · ${d.position.daysLeftInPeriod} days left`}
      />

      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6">

        {/* 1. How much do I have available? One number, explained. */}
        <section aria-label="Available to spend">
          <p className="text-sm text-[var(--text-muted)]">{d.available.label}</p>
          <p className="mt-1">
            <Money
              minor={d.available.amountMinor}
              currency={cur}
              size="xl"
              tone={d.available.tone === 'attention' ? 'expense' : 'plain'}
              className="text-3xl"
            />
          </p>
          <p className="mt-1.5 max-w-lg text-sm text-[var(--text-muted)]">{d.available.explanation}</p>
          {d.available.action ? (
            <Link href={d.available.action.href}
              className="mt-2 inline-block text-sm font-medium text-[var(--accent)] hover:underline">
              {d.available.action.label} →
            </Link>
          ) : null}

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
            <Figure label="Came in" minor={d.incomeReceived} currency={cur}
              note={d.incomeExpected > 0n ? `${formatMoney(d.incomeExpected, cur)} still expected` : undefined} />
            <Figure label="Spent" minor={d.spent} currency={cur}
              note={d.spentDeltaMinor !== null
                ? `${d.spentDeltaMinor > 0n ? 'up' : 'down'} ${formatMoney(d.spentDeltaMinor < 0n ? -d.spentDeltaMinor : d.spentDeltaMinor, cur)} on last month`
                : undefined}
              href="/transactions" />
            <Figure label="Still to pay" minor={d.upcomingTotal} currency={cur}
              note={d.commitmentCount > 0 ? `${d.commitmentCount} bill${d.commitmentCount === 1 ? '' : 's'}` : 'nothing scheduled'}
              href="/transactions?view=upcoming" />
            <Figure label={d.leftThisPeriod.label} minor={d.leftThisPeriod.amountMinor} currency={cur}
              note="income less spending and bills" />
          </dl>
        </section>

        {/* 2. What is coming? Placed second because it is the most actionable. */}
        <section aria-label="Coming up">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Coming up</h2>
            <Link href="/calendar" className="text-xs text-[var(--accent)] hover:underline">Calendar →</Link>
          </div>
          {d.upcoming.length > 0 ? (
            <Card className="overflow-hidden">
              <ul>
                {d.upcoming.map((item, i) => (
                  <li key={`${item.name}-${item.date}-${i}`}
                    className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0">
                    <div className="w-11 shrink-0 text-center">
                      <div className="text-2xs uppercase text-[var(--text-subtle)]">
                        {new Date(`${item.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', timeZone: 'UTC' })}
                      </div>
                      <div className="text-sm tabular font-medium">{Number(item.date.slice(8, 10))}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {item.origin === 'recurring' ? 'repeats' : 'scheduled by you'}
                      </p>
                    </div>
                    <Money minor={-item.amountMinor} currency={cur} size="sm" />
                  </li>
                ))}
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
          {d.nextIncome ? (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Next money in: {d.nextIncome.name}, {formatMoney(d.nextIncome.amountMinor, cur)} on{' '}
              {new Date(`${d.nextIncome.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })}.
            </p>
          ) : null}
        </section>

        {/* 3. Where has my money gone? */}
        <section aria-label="Where your money went">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Where it went</h2>
            <Link href="/analytics" className="text-xs text-[var(--accent)] hover:underline">Details →</Link>
          </div>
          {d.topCategories.length > 0 ? (
            <Card>
              <CardBody className="space-y-2.5 pt-4">
                {d.topCategories.map((c, i) => (
                  <Link key={c.id} href={`/transactions?category=${c.id}`}
                    className="block rounded px-1 py-1 hover:bg-[var(--surface-2)]">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{c.icon} {c.name}</span>
                      <Money minor={c.amountMinor} currency={cur} size="sm" tone="plain" />
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                      <div className="h-full rounded-full"
                        style={{ width: `${c.shareOfSpend}%`, background: `var(--chart-${(i % 8) + 1})` }} />
                    </div>
                  </Link>
                ))}
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

        {/* 4. Am I on track? Budget and goals share one section. */}
        {(d.budgetStatus || d.goalStatus.length > 0) ? (
          <section aria-label="On track">
            <h2 className="mb-2 text-base font-semibold">On track?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {d.budgetStatus ? (
                <Link href="/budget" className="block rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-strong)]">
                  <p className="text-sm text-[var(--text-muted)]">Budget</p>
                  <p className="mt-1">
                    <Money minor={d.budgetStatus.totalSpentMinor} currency={cur} size="lg" tone="plain" />
                    <span className="text-sm text-[var(--text-muted)]">
                      {' '}of {formatMoney(d.budgetStatus.totalTargetMinor, cur)}
                    </span>
                  </p>
                  <ProgressBar
                    className="mt-2"
                    fraction={d.budgetStatus.totalTargetMinor > 0n
                      ? Number(d.budgetStatus.totalSpentMinor) / Number(d.budgetStatus.totalTargetMinor) : 0}
                    markerFraction={d.budgetStatus.elapsedFraction}
                    tone={d.budgetStatus.totalRemainingMinor < 0n ? 'negative' : 'accent'}
                  />
                  <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                    {d.budgetStatus.warnings[0]?.message
                      ?? `${formatMoney(d.budgetStatus.totalRemainingMinor, cur)} left with ${d.budgetStatus.daysRemaining} days to go.`}
                  </p>
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
                <Link href="/goals" className="block rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-strong)]">
                  <p className="text-sm text-[var(--text-muted)]">Goals</p>
                  <div className="mt-1.5 space-y-2.5">
                    {d.goalStatus.map(({ goal, math }) => (
                      <div key={goal.id}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{goal.name}</span>
                          <span className="tabular text-xs text-[var(--text-muted)]">
                            {Math.round(math.progressFraction * 100)}%
                          </span>
                        </div>
                        <ProgressBar fraction={math.progressFraction} className="mt-1" />
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">
                          {formatMoney(goal.currentMinor, cur, { compact: true })} of{' '}
                          {formatMoney(goal.targetMinor, cur, { compact: true })}
                          {math.requiredMonthlyMinor !== null ? ` · ${formatMoney(math.requiredMonthlyMinor, cur)}/mo to stay on track` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
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

        {/* Insights, only when they say something actionable. */}
        {d.insights.length > 0 ? (
          <section aria-label="Worth knowing">
            <h2 className="mb-2 text-base font-semibold">Worth knowing</h2>
            <ul className="space-y-2">
              {d.insights.map((i) => (
                <li key={i.dedupeKey} className="flex gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3.5 py-2.5">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full')}
                    style={{ background: i.severity === 'attention' ? 'var(--negative)' : i.severity === 'notice' ? 'var(--warning)' : 'var(--info)' }} />
                  <div>
                    <p className="text-sm">{i.headline}</p>
                    {i.detail ? <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{i.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Recent activity, last and quiet. */}
        {d.recent.length > 0 ? (
          <section aria-label="Recent activity">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Recent</h2>
              <Link href="/transactions" className="text-xs text-[var(--accent)] hover:underline">All →</Link>
            </div>
            <Card className="overflow-hidden">
              <ul>
                {d.recent.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.description}</p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {new Date(`${t.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        {t.categoryName ? ` · ${t.categoryIcon ?? ''} ${t.categoryName}` : ''}
                      </p>
                    </div>
                    <Money
                      minor={t.type === 'income' || t.type === 'refund' ? d.absMinor(t.amountMinor) : -d.absMinor(t.amountMinor)}
                      currency={cur} size="sm"
                    />
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}
      </div>
    </>
  );
}

function Figure({
  label, minor, currency, note, href,
}: { label: string; minor: bigint; currency: string; note?: string; href?: string }) {
  const body = (
    <>
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5"><Money minor={minor} currency={currency} tone="plain" /></dd>
      {note ? <dd className="mt-0.5 text-2xs text-[var(--text-subtle)]">{note}</dd> : null}
    </>
  );
  return href
    ? <Link href={href} className="block rounded px-1 py-0.5 -mx-1 hover:bg-[var(--surface-2)]">{body}</Link>
    : <div>{body}</div>;
}


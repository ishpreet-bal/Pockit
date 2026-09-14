import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { buildOverview } from '@/lib/finance/view/overview';
import { PageHeader, PeriodFilter } from '../page-header';
import { Card, CardHeader, CardBody, EmptyState, LinkButton, Badge, ProgressBar, Table, Th, Td } from '@/components/ui/primitives';
import { Money, Percent } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import { IncomeExpenseChart, CategoryPie } from '@/components/charts/charts';
import { formatRange, type PeriodPreset } from '@/lib/finance/period';
import { toMajorNumber, formatMoney } from '@/lib/money';
import { SeedDemoButton } from './seed-demo';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

export default async function OverviewPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const { user, workspace } = await requireAuth();
  const params = await searchParams;
  const preset = (params.period ?? 'this_month') as PeriodPreset;

  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const d = await buildOverview(repo, preset, user.timezone);
  const cur = d.currency;

  if (!d.hasData) {
    return (
      <>
        <PageHeader title="Overview" description="Your financial command centre." />
        <div className="px-4 py-8 sm:px-6">
          <Card>
            <EmptyState
              icon="◎"
              title="Nothing here yet"
              description="Add your first transaction, import a statement or screenshot, or load realistic demo data to see how Pockit works."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <LinkButton href="/imports/new" variant="primary" className="px-4">Import a file</LinkButton>
                  <SeedDemoButton />
                </div>
              }
            />
          </Card>
        </div>
      </>
    );
  }

  const chartData = d.series.slice(-6).map((s) => ({
    label: new Date(`${s.month}-02`).toLocaleDateString('en-CA', { month: 'short' }),
    income: toMajorNumber(s.income, cur),
    expenses: toMajorNumber(s.expenses, cur),
  }));

  const pieData = d.topCategories.slice(0, 7).map((c) => ({
    name: c.name,
    value: toMajorNumber(c.amountMinor, cur),
  }));

  return (
    <>
      <PageHeader
        title={`Where you stand${user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}`}
        description={formatRange(d.range, user.locale)}
        action={<LinkButton href="/imports/new" variant="primary">Import</LinkButton>}
      >
        <PeriodFilter active={preset} />
      </PageHeader>

      <div className="space-y-4 px-4 py-4 sm:px-6">

        {/* 1. Where do I stand today? */}
        <section aria-label="Current position" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Cash available" minor={d.cash.cashMinor} currency={cur} href="/accounts"
            hint={`Across ${d.accounts.filter((a) => a.normalBalance === 'debit').length} accounts`} />
          <Stat label="Net worth" minor={d.netWorth.netMinor} currency={cur} href="/analytics/networth"
            hint={`${formatMoney(d.netWorth.assetsMinor, cur, { compact: true })} assets − ${formatMoney(d.netWorth.liabilitiesMinor, cur, { compact: true })} debt`} />
          <Stat label="Income this period" minor={d.totals.income} currency={cur} tone="plain"
            href={`/transactions?type=income&period=${preset}`}
            delta={d.deltas.income} deltaBasis="vs previous" />
          <Stat label="Spending this period" minor={d.totals.expenses} currency={cur} tone="plain"
            href={`/transactions?type=expense&period=${preset}`}
            delta={d.deltas.expenses} deltaBasis="vs previous" invertDelta />
        </section>

        {/* Safe to spend — the single most actionable figure. */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title="Safe to spend" description={`Through ${d.safeToSpend.throughDate}`} />
            <CardBody>
              <Money minor={d.safeToSpend.safeToSpendMinor} currency={cur} size="xl"
                tone={d.safeToSpend.safeToSpendMinor < 0n ? 'expense' : 'plain'} />
              <ul className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
                {d.safeToSpend.lines.map((line) => (
                  <li key={line.label} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-muted)]">
                      <span className="truncate">{line.label}</span>
                      {line.certainty === 'estimated' ? <Badge tone="neutral">est.</Badge> : null}
                    </span>
                    <Money minor={line.amountMinor} currency={cur} size="sm" tone="auto" />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-subtle)]">
                {d.safeToSpend.assumptions[1]}
              </p>
            </CardBody>
          </Card>

          {/* 2. Where did my money go? */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Income vs expenses"
              description="Last 6 months"
              action={<Link href="/analytics" className="text-xs text-[var(--accent)] hover:underline">Analytics →</Link>}
            />
            <CardBody className="pb-3">
              <IncomeExpenseChart data={chartData} currency={cur} />
              <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 text-center">
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Net cash flow</dt>
                  <dd className="mt-0.5"><Money minor={d.totals.netCashFlow} currency={cur} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Savings rate</dt>
                  <dd className="mt-0.5 text-base font-medium"><Percent bps={d.totals.savingsRateBps} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Invested</dt>
                  <dd className="mt-0.5"><Money minor={d.totals.investments} currency={cur} /></dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Where it went" description={`${d.transactionCount} transactions`} />
            <CardBody>
              {pieData.length > 0 ? (
                <>
                  <CategoryPie data={pieData} currency={cur} />
                  <ul className="mt-2 space-y-1.5">
                    {d.topCategories.slice(0, 5).map((c, i) => (
                      <li key={c.id}>
                        <Link
                          href={`/transactions?category=${c.id}&period=${preset}`}
                          className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-[var(--surface-2)]"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--chart-${(i % 8) + 1})` }} />
                            <span className="truncate">{c.icon} {c.name}</span>
                          </span>
                          <Money minor={c.amountMinor} currency={cur} size="sm" tone="plain" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState title="No spending this period" description="Transactions in this range will appear here grouped by category." />
              )}
            </CardBody>
          </Card>

          {/* 3. What payments are coming? */}
          <Card>
            <CardHeader
              title="Coming up"
              description={`${formatMoney(d.subscriptions.monthlyMinor, cur)}/mo recurring`}
              action={<Link href="/recurring" className="text-xs text-[var(--accent)] hover:underline">All →</Link>}
            />
            <CardBody>
              {d.upcoming.length > 0 ? (
                <ul className="space-y-2">
                  {d.upcoming.map((u) => (
                    <li key={`${u.seriesKey}-${u.date}`} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{u.name}</p>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {new Date(`${u.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        </p>
                      </div>
                      <Money minor={u.amountMinor} currency={cur} size="sm" tone="plain" />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nothing scheduled" description="Recurring payments are detected automatically once a pattern repeats three times." />
              )}
            </CardBody>
          </Card>

          {/* 4. Am I on track for my goals? */}
          <Card>
            <CardHeader
              title="Goal progress"
              action={<Link href="/goals" className="text-xs text-[var(--accent)] hover:underline">All →</Link>}
            />
            <CardBody>
              {d.goalStatus.length > 0 ? (
                <ul className="space-y-3.5">
                  {d.goalStatus.map(({ goal, math }) => (
                    <li key={goal.id}>
                      <Link href={`/goals/${goal.id}`} className="block rounded px-1 py-0.5 hover:bg-[var(--surface-2)]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{goal.name}</span>
                          <span className="tabular shrink-0 text-xs text-[var(--text-muted)]">
                            {Math.round(math.progressFraction * 100)}%
                          </span>
                        </div>
                        <ProgressBar fraction={math.progressFraction} className="mt-1.5" tone="accent" />
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">
                          {formatMoney(goal.currentMinor, cur, { compact: true })} of {formatMoney(goal.targetMinor, cur, { compact: true })}
                          {math.requiredMonthlyMinor !== null
                            ? ` · ${formatMoney(math.requiredMonthlyMinor, cur)}/mo needed`
                            : ''}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No active goals"
                  description="Set a target and Pockit works out what you need to save each month, and whether your cash flow supports it."
                  action={<LinkButton href="/goals">Create a goal</LinkButton>}
                />
              )}
            </CardBody>
          </Card>
        </section>

        {/* 5. What should I pay attention to? */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Worth your attention" description="Computed from your transactions, not generated guesses" />
            <CardBody>
              {d.insights.length > 0 || (d.budgetStatus?.warnings.length ?? 0) > 0 ? (
                <ul className="space-y-2.5">
                  {d.budgetStatus?.warnings.slice(0, 2).map((w) => (
                    <li key={w.key} className="flex gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: w.severity === 'attention' ? 'var(--negative)' : 'var(--warning)' }} />
                      <p className="text-sm text-[var(--text)]">{w.message}</p>
                    </li>
                  ))}
                  {d.insights.map((i) => (
                    <li key={i.dedupeKey} className="flex gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: i.severity === 'attention' ? 'var(--negative)' : i.severity === 'notice' ? 'var(--warning)' : 'var(--info)' }} />
                      <div>
                        <p className="text-sm text-[var(--text)]">{i.headline}</p>
                        {i.detail ? <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{i.detail}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nothing unusual" description="Pockit compares each period against your own history and surfaces only what actually changed." />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent activity"
              action={<Link href="/transactions" className="text-xs text-[var(--accent)] hover:underline">All →</Link>}
            />
            <CardBody className="px-0 pb-0">
              <Table>
                <thead>
                  <tr><Th>Date</Th><Th>Description</Th><Th numeric>Amount</Th></tr>
                </thead>
                <tbody>
                  {d.recentTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-[var(--surface-2)]">
                      <Td className="whitespace-nowrap text-[var(--text-muted)]">
                        {new Date(`${t.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      </Td>
                      <Td>
                        <span className="block truncate">{t.description}</span>
                        {t.categoryName ? <span className="text-xs text-[var(--text-subtle)]">{t.categoryIcon} {t.categoryName}</span> : null}
                      </Td>
                      <Td numeric>
                        <Money
                          minor={t.type === 'income' || t.type === 'refund' ? (t.amountMinor < 0n ? -t.amountMinor : t.amountMinor) : -(t.amountMinor < 0n ? -t.amountMinor : t.amountMinor)}
                          currency={cur} size="sm"
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </section>
      </div>
    </>
  );
}

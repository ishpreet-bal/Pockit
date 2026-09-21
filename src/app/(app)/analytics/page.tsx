import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader, PeriodFilter } from '../page-header';
import { SectionTabs, INSIGHTS_TABS } from '@/components/ui/section-tabs';
import { Card, CardHeader, CardBody, EmptyState, Table, Th, Td, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import { IncomeExpenseChart, CashFlowChart, CategoryPie } from '@/components/charts/charts';
import {
  periodTotals, spendingByCategory, rollUpCategories, monthlySeries, allAccountBalances,
} from '@/lib/finance/ledger';
import { analyzePatterns } from '@/lib/finance/patterns';
import { computeNetWorth } from '@/lib/finance/networth';
import { resolvePeriod, todayIn, formatRange, startOfMonth, addMonths, type PeriodPreset } from '@/lib/finance/period';
import { toMajorNumber, formatMoney, percentOf } from '@/lib/money';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const { user, workspace } = await requireAuth();
  const params = await searchParams;
  const preset = (params.period ?? 'last_3_months') as PeriodPreset;

  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const range = resolvePeriod(preset, today);
  const cur = workspace.baseCurrency;

  const [txns, categories, accounts, assets, liabilities] = await Promise.all([
    repo.listTransactions(), repo.listCategories(), repo.listAccounts(),
    repo.listAssets(), repo.listLiabilities(),
  ]);

  if (txns.length === 0) {
    return (
      <>
        <PageHeader title="Insights">
          <SectionTabs tabs={INSIGHTS_TABS} />
        </PageHeader>
        <div className="px-4 py-8 sm:px-6">
          <Card>
            <EmptyState
              icon="◔"
              title="Nothing to analyse yet"
              description="Import a statement or add some transactions, and this fills with your spending patterns, category breakdowns and net-worth history."
              action={<LinkButton href="/imports/new" variant="primary">Import a file</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  const inRange = txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);
  const totals = periodTotals(inRange);
  const patterns = analyzePatterns(inRange, categories);
  const leaf = spendingByCategory(inRange);
  const rolled = rollUpCategories(leaf, categories);

  const topLevel = categories
    .filter((c) => c.parentId === null && c.kind === 'expense')
    .map((c) => ({ c, amount: rolled.get(c.id) ?? 0n }))
    .filter((x) => x.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : -1));

  const series = monthlySeries(txns, { start: startOfMonth(addMonths(today, -11)), end: today });
  const balances = allAccountBalances(accounts, txns, today);
  const netWorth = computeNetWorth(
    accounts, balances,
    assets.map((a) => ({ id: a.id, name: a.name, category: a.category, valueMinor: BigInt(a.valueMinor as unknown as string), asOf: a.asOf, accountId: a.accountId })),
    liabilities.map((l) => ({ id: l.id, name: l.name, category: l.category, valueMinor: BigInt(l.balanceMinor as unknown as string), asOf: l.asOf, accountId: l.accountId })),
  );

  const fixedShare = percentOf(patterns.fixedMinor, patterns.fixedMinor + patterns.variableMinor);
  const essentialShare = percentOf(patterns.essentialMinor, patterns.essentialMinor + patterns.discretionaryMinor);

  return (
    <>
      <PageHeader title="Insights" description={formatRange(range, user.locale)}>
        <SectionTabs tabs={INSIGHTS_TABS} />
        <div className="mt-3"><PeriodFilter active={preset} /></div>
      </PageHeader>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total spending" minor={totals.expenses} currency={cur} hint={`${totals.transactionCount} transactions`} />
          <Stat label="Average transaction" minor={patterns.averageTransactionMinor} currency={cur} />
          <Stat label="Net worth" minor={netWorth.netMinor} currency={cur} href="/accounts" />
          <Stat
            label="Largest single expense"
            minor={patterns.largestTransaction?.amountMinor ?? 0n}
            currency={cur}
            hint={patterns.largestTransaction?.description ?? 'None'}
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Income vs expenses" description="Last 12 months" />
            <CardBody>
              <IncomeExpenseChart
                data={series.map((s) => ({
                  label: new Date(`${s.month}-02`).toLocaleDateString('en-CA', { month: 'short' }),
                  income: toMajorNumber(s.income, cur),
                  expenses: toMajorNumber(s.expenses, cur),
                }))}
                currency={cur}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Monthly cash flow" description="Income minus expenses each month" />
            <CardBody>
              <CashFlowChart
                data={series.map((s) => ({
                  label: new Date(`${s.month}-02`).toLocaleDateString('en-CA', { month: 'short' }),
                  net: toMajorNumber(s.net, cur),
                }))}
                currency={cur}
              />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Spending by category" />
            <CardBody>
              <CategoryPie
                data={topLevel.slice(0, 7).map((x) => ({ name: x.c.name, value: toMajorNumber(x.amount, cur) }))}
                currency={cur}
              />
              <ul className="mt-2 space-y-1">
                {topLevel.slice(0, 8).map((x, i) => (
                  <li key={x.c.id}>
                    <Link
                      href={`/transactions?category=${x.c.id}&period=${preset}`}
                      className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-[var(--surface-2)]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--chart-${(i % 8) + 1})` }} />
                        <span className="truncate">{x.c.name}</span>
                      </span>
                      <Money minor={x.amount} currency={cur} size="sm" tone="plain" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Spending patterns" description="Classifications are yours to change in Settings" />
            <CardBody className="space-y-3">
              <PatternRow
                label="Weekday vs weekend"
                left={`${formatMoney(patterns.weekdayDailyAverageMinor, cur)}/day`}
                right={`${formatMoney(patterns.weekendDailyAverageMinor, cur)}/day`}
                leftLabel="Weekdays" rightLabel="Weekends"
                fraction={percentOf(patterns.weekdayMinor, patterns.weekdayMinor + patterns.weekendMinor) / 100}
              />
              <PatternRow
                label="Fixed vs variable"
                left={formatMoney(patterns.fixedMinor, cur)}
                right={formatMoney(patterns.variableMinor, cur)}
                leftLabel={`Fixed ${fixedShare.toFixed(0)}%`} rightLabel="Variable"
                fraction={fixedShare / 100}
              />
              <PatternRow
                label="Essential vs discretionary"
                left={formatMoney(patterns.essentialMinor, cur)}
                right={formatMoney(patterns.discretionaryMinor, cur)}
                leftLabel={`Essential ${essentialShare.toFixed(0)}%`} rightLabel="Discretionary"
                fraction={essentialShare / 100}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Top merchants" description="By total spend" />
            <CardBody className="px-0 pb-0">
              <Table>
                <thead><tr><Th>Merchant</Th><Th numeric>Visits</Th><Th numeric>Total</Th></tr></thead>
                <tbody>
                  {patterns.topMerchants.map((m) => (
                    <tr key={m.merchantName} className="hover:bg-[var(--surface-2)]">
                      <Td><span className="block max-w-[18ch] truncate">{m.merchantName}</span></Td>
                      <Td numeric className="text-[var(--text-muted)]">{m.transactionCount}</Td>
                      <Td numeric><Money minor={m.amountMinor} currency={cur} size="sm" tone="plain" /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Net worth" description="Assets minus liabilities, from account balances and manual entries" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-[var(--text-subtle)]">Assets</p>
              <ul className="mt-1.5 space-y-1">
                {netWorth.assets.map((a) => (
                  <li key={a.key} className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-[var(--text-muted)]">{a.label}</span>
                    <Money minor={a.amountMinor} currency={cur} size="sm" tone="plain" />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-[var(--text-subtle)]">Liabilities</p>
              <ul className="mt-1.5 space-y-1">
                {netWorth.liabilities.length === 0 ? (
                  <li className="text-sm text-[var(--text-subtle)]">None</li>
                ) : netWorth.liabilities.map((l) => (
                  <li key={l.key} className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-[var(--text-muted)]">{l.label}</span>
                    <Money minor={l.amountMinor} currency={cur} size="sm" tone="plain" />
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function PatternRow({
  label, left, right, leftLabel, rightLabel, fraction,
}: { label: string; left: string; right: string; leftLabel: string; rightLabel: string; fraction: number }) {
  const pct = Math.max(0, Math.min(100, fraction * 100));
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="h-full" style={{ width: `${pct}%`, background: 'var(--chart-1)' }} />
        <div className="h-full flex-1" style={{ background: 'var(--chart-3)' }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-[var(--text-subtle)]">
        <span>{leftLabel} · {left}</span>
        <span>{rightLabel} · {right}</span>
      </div>
    </div>
  );
}

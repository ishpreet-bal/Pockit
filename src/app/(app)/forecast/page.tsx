import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { SectionTabs, INSIGHTS_TABS } from '@/components/ui/section-tabs';
import { Card, CardHeader, CardBody, EmptyState, Table, Th, Td, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import { BalanceProjectionChart } from '@/components/charts/charts';
import { forecast, safeToSpend, resolveHorizon } from '@/lib/finance/forecast';
import { detectRecurring } from '@/lib/finance/recurring';
import { allAccountBalances, cashPosition } from '@/lib/finance/ledger';
import { todayIn, startOfMonth, endOfMonth, endOfWeek, addMonths } from '@/lib/finance/period';
import { toMajorNumber, formatMoney, sumMinor } from '@/lib/money';

export const metadata: Metadata = { title: 'Forecast' };
export const dynamic = 'force-dynamic';

const HORIZONS = [7, 30, 60, 90];

export default async function ForecastPage({
  searchParams,
}: { searchParams: Promise<{ days?: string }> }) {
  const { user, workspace } = await requireAuth();
  const params = await searchParams;
  const horizonDays = HORIZONS.includes(Number(params.days)) ? Number(params.days) : 30;

  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;

  const [accounts, txns, categories, goals] = await Promise.all([
    repo.listAccounts(), repo.listTransactions(), repo.listCategories(), repo.listGoals(),
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
              icon="↗"
              title="Not enough history to forecast"
              description="Forecasting uses your recurring payments and your average daily spending. Import a few months of history and this fills in."
              action={<LinkButton href="/imports/new" variant="primary">Import a file</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  const balances = allAccountBalances(accounts, txns, today);
  const position = cashPosition(accounts, balances);
  const series = detectRecurring(
    txns, today, undefined, new Map(accounts.map((a) => [a.id, a.normalBalance])),
  );
  const historyRange = { start: startOfMonth(addMonths(today, -2)), end: today };

  const result = forecast({
    startingBalanceMinor: position.cashMinor,
    today, horizonDays, series,
    historyTxns: txns, historyRange, categories,
  });

  const monthlyGoalCommitment = sumMinor(
    goals.map((g) => (g.monthlyContributionMinor === null ? 0n : BigInt(g.monthlyContributionMinor as unknown as string))),
  );

  const sts = safeToSpend({
    availableCashMinor: position.cashMinor,
    today,
    throughDate: resolveHorizon('this_month', today, null, endOfMonth(today), endOfWeek(today)),
    horizon: 'this_month',
    series,
    monthlySavingsCommitmentMinor: monthlyGoalCommitment,
    monthlyInvestmentCommitmentMinor: 0n,
    historyTxns: txns, historyRange, categories,
  });

  const chartData = result.days.map((d) => ({
    label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    balance: toMajorNumber(d.closingMinor, cur),
  }));

  return (
    <>
      <PageHeader
        title="Insights"
        description={`Projected from your scheduled payments plus an estimated daily rate of ${formatMoney(result.dailyVariableRateMinor, cur)} for everything else.`}
      >
        <SectionTabs tabs={INSIGHTS_TABS} />
        <div className="mt-3 flex gap-1" role="group" aria-label="Forecast horizon">
          {HORIZONS.map((d) => (
            <a
              key={d}
              href={`/forecast?days=${d}`}
              aria-current={d === horizonDays ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                d === horizonDays
                  ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
              }`}
            >
              {d} days
            </a>
          ))}
        </div>
      </PageHeader>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Cash today" minor={result.startingBalanceMinor} currency={cur} />
          <Stat label="Expected income" minor={result.expectedIncomeMinor} currency={cur} hint="Scheduled, known" />
          <Stat label="Scheduled bills" minor={-result.knownExpensesMinor} currency={cur} hint="Scheduled, known" />
          <Stat
            label={`Projected in ${horizonDays} days`}
            minor={result.projectedBalanceMinor}
            currency={cur}
            hint={`Low point ${formatMoney(result.lowestPointMinor, cur)} on ${result.lowestPointDate}`}
          />
        </section>

        <Card>
          <CardHeader
            title="Projected balance"
            description="Known scheduled items are exact; the downward drift between them is an estimate."
          />
          <CardBody><BalanceProjectionChart data={chartData} currency={cur} /></CardBody>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Safe to spend" description={`Through ${sts.throughDate}`} />
            <CardBody>
              <Money minor={sts.safeToSpendMinor} currency={cur} size="xl" tone={sts.safeToSpendMinor < 0n ? 'expense' : 'plain'} />
              <ul className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
                {sts.lines.map((line) => (
                  <li key={line.label} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-muted)]">
                      <span className="truncate">{line.label}</span>
                      {line.certainty === 'estimated' ? <Badge tone="neutral">est.</Badge> : null}
                    </span>
                    <Money minor={line.amountMinor} currency={cur} size="sm" />
                  </li>
                ))}
              </ul>
              <ul className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
                {sts.assumptions.map((a) => (
                  <li key={a} className="text-xs leading-relaxed text-[var(--text-subtle)]">{a}</li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Scheduled between now and then"
              description={`${result.scheduled.length} known items — estimates are not listed here`}
            />
            <CardBody className="px-0 pb-0">
              {result.scheduled.length === 0 ? (
                <EmptyState title="Nothing scheduled" description="Recurring payments appear here once detected." />
              ) : (
                <Table>
                  <thead><tr><Th>Date</Th><Th>What</Th><Th numeric>Amount</Th></tr></thead>
                  <tbody>
                    {result.scheduled.slice(0, 20).map((item, i) => (
                      <tr key={`${item.sourceKey}-${item.date}-${i}`} className="hover:bg-[var(--surface-2)]">
                        <Td className="whitespace-nowrap text-[var(--text-muted)]">{item.date}</Td>
                        <Td><span className="block max-w-[24ch] truncate">{item.name}</span></Td>
                        <Td numeric>
                          <Money
                            minor={item.type === 'income' ? item.amountMinor : -item.amountMinor}
                            currency={cur} size="sm"
                          />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

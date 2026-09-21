import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { SectionTabs, BALANCES_TABS } from '@/components/ui/section-tabs';
import { Card, CardHeader, CardBody, EmptyState, Table, Th, Td, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import { compareStrategies, minimumViableBudget, simulatePayoff, type DebtInput } from '@/lib/finance/debt';
import { todayIn } from '@/lib/finance/period';
import { formatMoney, sumMinor } from '@/lib/money';

export const metadata: Metadata = { title: 'Debts' };
export const dynamic = 'force-dynamic';

export default async function DebtsPage({
  searchParams,
}: { searchParams: Promise<{ budget?: string }> }) {
  const { user, workspace } = await requireAuth();
  const params = await searchParams;
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;

  const rows = await repo.listDebts();
  const debts: DebtInput[] = rows.map((d) => ({
    id: d.id,
    name: d.name,
    balanceMinor: BigInt(d.balanceMinor as unknown as string),
    aprBps: d.aprBps,
    minPaymentMinor: BigInt(d.minPaymentMinor as unknown as string),
    strategyOrder: d.strategyOrder,
  }));

  if (debts.length === 0) {
    return (
      <>
        <PageHeader title="Accounts &amp; debts">
          <SectionTabs tabs={BALANCES_TABS} />
        </PageHeader>
        <div className="px-4 py-8 sm:px-6">
          <Card>
            <EmptyState
              icon="▼"
              title="No debts tracked"
              description="Add a balance, interest rate and minimum payment, and Pockit will compare payoff strategies and show what each one costs in interest and time."
              action={<LinkButton href="/accounts" variant="primary">View accounts</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  const totalBalance = sumMinor(debts.map((d) => d.balanceMinor));
  const totalMinimum = sumMinor(debts.map((d) => d.minPaymentMinor));
  const minimumViable = minimumViableBudget(debts);

  // Default to 1.5x the minimums, which is a realistic starting point for comparison.
  const requested = params.budget ? BigInt(Math.round(Number(params.budget) * 100)) : 0n;
  const budget = requested > 0n ? requested : (totalMinimum * 3n) / 2n;

  const comparison = compareStrategies(debts, budget, today);
  const minimumOnly = simulatePayoff(debts, totalMinimum, 'avalanche', today);

  return (
    <>
      <PageHeader
        title="Accounts &amp; debts"
        description={`Simulated month by month at ${formatMoney(budget, cur)} per month across all debts.`}
      >
        <SectionTabs tabs={BALANCES_TABS} />
      </PageHeader>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total owed" minor={totalBalance} currency={cur} hint={`${debts.length} debts`} />
          <Stat label="Minimum payments" minor={totalMinimum} currency={cur} hint="Per month, combined" />
          <Stat
            label="Payoff time"
            minor={budget}
            currency={cur}
            hint={comparison.avalanche.neverPaysOff
              ? 'This budget never clears the balance'
              : `${comparison.avalanche.months} months at this budget`}
          />
          <Stat
            label="Interest cost"
            minor={comparison.avalanche.totalInterestMinor}
            currency={cur}
            hint="Highest-rate-first strategy"
          />
        </section>

        {budget < minimumViable ? (
          <Card>
            <CardBody className="pt-4">
              <p className="text-sm">
                At {formatMoney(budget, cur)} per month these balances would grow rather than shrink, because that is
                less than the interest plus minimum payments of {formatMoney(minimumViable, cur)}.
              </p>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Strategy comparison"
            description="Same budget, different order of attack"
          />
          <CardBody className="px-0 pb-0">
            <Table>
              <thead>
                <tr><Th>Strategy</Th><Th>Order</Th><Th numeric>Months</Th><Th numeric>Total interest</Th><Th numeric>Debt free</Th></tr>
              </thead>
              <tbody>
                <tr className="hover:bg-[var(--surface-2)]">
                  <Td><span className="font-medium">Avalanche</span> <Badge tone="positive">Cheapest</Badge></Td>
                  <Td className="text-[var(--text-muted)]">Highest interest rate first</Td>
                  <Td numeric>{comparison.avalanche.neverPaysOff ? '—' : comparison.avalanche.months}</Td>
                  <Td numeric><Money minor={comparison.avalanche.totalInterestMinor} currency={cur} size="sm" tone="plain" /></Td>
                  <Td numeric className="whitespace-nowrap text-[var(--text-muted)]">{comparison.avalanche.payoffDate ?? '—'}</Td>
                </tr>
                <tr className="hover:bg-[var(--surface-2)]">
                  <Td><span className="font-medium">Snowball</span> <Badge>Fastest first win</Badge></Td>
                  <Td className="text-[var(--text-muted)]">Smallest balance first</Td>
                  <Td numeric>{comparison.snowball.neverPaysOff ? '—' : comparison.snowball.months}</Td>
                  <Td numeric><Money minor={comparison.snowball.totalInterestMinor} currency={cur} size="sm" tone="plain" /></Td>
                  <Td numeric className="whitespace-nowrap text-[var(--text-muted)]">{comparison.snowball.payoffDate ?? '—'}</Td>
                </tr>
                <tr className="hover:bg-[var(--surface-2)] opacity-70">
                  <Td><span className="font-medium">Minimums only</span></Td>
                  <Td className="text-[var(--text-muted)]">For comparison</Td>
                  <Td numeric>{minimumOnly.neverPaysOff ? '—' : minimumOnly.months}</Td>
                  <Td numeric><Money minor={minimumOnly.totalInterestMinor} currency={cur} size="sm" tone="plain" /></Td>
                  <Td numeric className="whitespace-nowrap text-[var(--text-muted)]">{minimumOnly.payoffDate ?? '—'}</Td>
                </tr>
              </tbody>
            </Table>
          </CardBody>
        </Card>

        {comparison.interestDifferenceMinor !== 0n ? (
          <Card>
            <CardBody className="pt-4">
              <p className="text-sm">
                Paying the highest interest rate first would cost{' '}
                <strong>{formatMoney(
                  comparison.interestDifferenceMinor < 0n ? -comparison.interestDifferenceMinor : comparison.interestDifferenceMinor,
                  cur,
                )}</strong>{' '}
                {comparison.interestDifferenceMinor > 0n ? 'less' : 'more'} in interest than smallest-balance-first
                {comparison.monthsDifference !== 0
                  ? `, and finish ${Math.abs(comparison.monthsDifference)} month${Math.abs(comparison.monthsDifference) === 1 ? '' : 's'} ${comparison.monthsDifference > 0 ? 'sooner' : 'later'}`
                  : ''}.
              </p>
              <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                Simulated month by month at a fixed budget, assuming the stated rates do not change and no new debt
                is added. This is a projection, not financial advice.
              </p>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Your debts" description="Highest interest rate first" />
          <CardBody className="px-0 pb-0">
            <Table>
              <thead>
                <tr><Th>Debt</Th><Th numeric>Balance</Th><Th numeric>Rate</Th><Th numeric>Minimum</Th><Th numeric>Cleared (avalanche)</Th></tr>
              </thead>
              <tbody>
                {[...debts].sort((a, b) => b.aprBps - a.aprBps).map((d) => {
                  const detail = comparison.avalanche.perDebt.find((p) => p.id === d.id);
                  return (
                    <tr key={d.id} className="hover:bg-[var(--surface-2)]">
                      <Td className="font-medium">{d.name}</Td>
                      <Td numeric><Money minor={d.balanceMinor} currency={cur} size="sm" tone="plain" /></Td>
                      <Td numeric className="text-[var(--text-muted)]">{(d.aprBps / 100).toFixed(2)}%</Td>
                      <Td numeric><Money minor={d.minPaymentMinor} currency={cur} size="sm" tone="plain" /></Td>
                      <Td numeric className="whitespace-nowrap text-[var(--text-muted)]">{detail?.payoffDate ?? '—'}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

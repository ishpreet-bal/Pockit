import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader, PeriodFilter } from '../page-header';
import { Card, CardHeader, CardBody, EmptyState, Table, Th, Td, Badge, LinkButton } from '@/components/ui/primitives';
import { Money, Percent } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import { IncomeExpenseChart } from '@/components/charts/charts';
import { splitByClassification, spendingByCategory, monthlySeries } from '@/lib/finance/ledger';
import { resolvePeriod, todayIn, formatRange, startOfMonth, addMonths, type PeriodPreset } from '@/lib/finance/period';
import { toMajorNumber, mulRatio } from '@/lib/money';

export const metadata: Metadata = { title: 'Business' };
export const dynamic = 'force-dynamic';

export default async function BusinessPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const { user, workspace, workspaces } = await requireAuth();
  const params = await searchParams;
  const preset = (params.period ?? 'last_3_months') as PeriodPreset;

  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const range = resolvePeriod(preset, today);
  const cur = workspace.baseCurrency;

  const [txns, categories] = await Promise.all([repo.listTransactions(), repo.listCategories()]);
  const inRange = txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);
  const { business, personal } = splitByClassification(inRange);

  const businessTxns = inRange.filter(
    (t) => t.businessClassification === 'business' || t.businessClassification === 'split',
  );
  const hasBusiness = businessTxns.length > 0;
  const businessWorkspace = workspaces.find((w) => w.kind === 'business');

  if (!hasBusiness) {
    return (
      <>
        <PageHeader title="Business" />
        <div className="px-4 py-8 sm:px-6">
          <Card>
            <EmptyState
              icon="▣"
              title="No business activity in this workspace"
              description={
                businessWorkspace && businessWorkspace.id !== workspace.id
                  ? 'You have a separate Business workspace. Switch to it using the selector at the top left, or classify transactions here as business.'
                  : 'Mark any transaction as Business — or split one between personal and business — and its revenue, expenses and margin appear here.'
              }
              action={<LinkButton href="/transactions" variant="primary">Go to transactions</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  const profit = business.income - business.expenses;
  const marginBps = business.income > 0n ? Number(mulRatio(profit, 10_000n, business.income)) : 0;

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const expenseByCategory = spendingByCategory(businessTxns).slice(0, 8);

  const series = monthlySeries(
    txns.filter((t) => t.businessClassification === 'business'),
    { start: startOfMonth(addMonths(today, -5)), end: today },
  );

  const taxRelevant = businessTxns.filter((t) => t.businessClassification === 'business');

  return (
    <>
      <PageHeader
        title="Business"
        description={`${formatRange(range, user.locale)} · ${businessTxns.length} business transactions`}
      >
        <PeriodFilter active={preset} />
      </PageHeader>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Revenue" minor={business.income} currency={cur}
            href={`/transactions?type=income&period=${preset}`} />
          <Stat label="Expenses" minor={business.expenses} currency={cur}
            href={`/transactions?type=expense&period=${preset}`} />
          <Stat label="Profit" minor={profit} currency={cur} tone="auto" />
          <Stat label="Margin" minor={0n} currency={cur} tone="plain"
            footer={
              <p className="mt-1 text-2xl font-semibold tabular">
                <Percent bps={marginBps} />
              </p>
            }
            hint="Profit as a share of revenue"
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Revenue vs expenses" description="Last 6 months, business only" />
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
            <CardHeader title="Largest expense categories" />
            <CardBody className="px-0 pb-0">
              {expenseByCategory.length === 0 ? (
                <EmptyState title="No business expenses" description="Classify an expense as business and it appears here." />
              ) : (
                <Table>
                  <thead><tr><Th>Category</Th><Th numeric>Transactions</Th><Th numeric>Total</Th></tr></thead>
                  <tbody>
                    {expenseByCategory.map((c) => (
                      <tr key={c.categoryId ?? 'none'} className="hover:bg-[var(--surface-2)]">
                        <Td>
                          {c.categoryId ? (
                            <Link href={`/transactions?category=${c.categoryId}&period=${preset}`} className="hover:underline">
                              {categoryById.get(c.categoryId)?.icon} {categoryById.get(c.categoryId)?.name}
                            </Link>
                          ) : 'Uncategorised'}
                        </Td>
                        <Td numeric className="text-[var(--text-muted)]">{c.transactionCount}</Td>
                        <Td numeric><Money minor={c.amountMinor} currency={cur} size="sm" tone="plain" /></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Personal and business, side by side"
            description="Split transactions contribute their own share to each side, never the whole amount to both."
          />
          <CardBody className="px-0 pb-0">
            <Table>
              <thead><tr><Th /><Th numeric>Personal</Th><Th numeric>Business</Th></tr></thead>
              <tbody>
                <tr><Td className="font-medium">Income</Td>
                  <Td numeric><Money minor={personal.income} currency={cur} size="sm" tone="plain" /></Td>
                  <Td numeric><Money minor={business.income} currency={cur} size="sm" tone="plain" /></Td></tr>
                <tr><Td className="font-medium">Expenses</Td>
                  <Td numeric><Money minor={personal.expenses} currency={cur} size="sm" tone="plain" /></Td>
                  <Td numeric><Money minor={business.expenses} currency={cur} size="sm" tone="plain" /></Td></tr>
                <tr><Td className="font-medium">Net</Td>
                  <Td numeric><Money minor={personal.netCashFlow} currency={cur} size="sm" /></Td>
                  <Td numeric><Money minor={business.netCashFlow} currency={cur} size="sm" /></Td></tr>
              </tbody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Business transactions"
            description="Tax labels are yours to confirm — Pockit never decides what is deductible."
          />
          <CardBody className="px-0 pb-0">
            <Table>
              <thead>
                <tr><Th>Date</Th><Th>Description</Th><Th>Category</Th><Th>Tax label</Th><Th numeric>Amount</Th></tr>
              </thead>
              <tbody>
                {taxRelevant.slice(0, 40).map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--surface-2)]">
                    <Td className="whitespace-nowrap text-[var(--text-muted)]">
                      {new Date(`${t.postedDate}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    </Td>
                    <Td><span className="block max-w-[26ch] truncate">{t.merchantName ?? t.description}</span></Td>
                    <Td className="text-[var(--text-muted)]">
                      {t.categoryId ? categoryById.get(t.categoryId)?.name ?? '—' : '—'}
                    </Td>
                    <Td><Badge tone="neutral">unreviewed</Badge></Td>
                    <Td numeric>
                      <Money
                        minor={t.type === 'income' ? t.baseAmountMinor : -(t.baseAmountMinor < 0n ? -t.baseAmountMinor : t.baseAmountMinor)}
                        currency={cur} size="sm"
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

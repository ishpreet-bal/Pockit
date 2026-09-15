import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, CardHeader, CardBody, EmptyState, Table, Th, Td, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import { detectRecurring, summarizeSubscriptions, monthlyEquivalent } from '@/lib/finance/recurring';
import { todayIn } from '@/lib/finance/period';
import { formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Recurring' };
export const dynamic = 'force-dynamic';

export default async function RecurringPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;

  const [txns, categories, accounts] = await Promise.all([
    repo.listTransactions(), repo.listCategories(), repo.listAccounts(),
  ]);
  const detected = detectRecurring(
    txns, today, undefined, new Map(accounts.map((a) => [a.id, a.normalBalance])),
  );
  const summary = summarizeSubscriptions(detected);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const subscriptions = detected.filter((s) => s.kind === 'subscription' || s.kind === 'bill');
  const income = detected.filter((s) => s.kind === 'income');
  const priceRises = detected.filter((s) => s.priceChanges.length > 0);

  return (
    <>
      <PageHeader
        title="Recurring"
        description="Detected automatically from repeated payments. A pattern needs three occurrences before it counts."
      />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {subscriptions.length === 0 ? (
          <Card>
            <EmptyState
              icon="↻"
              title="No recurring payments detected yet"
              description="Once the same merchant charges you three times on a regular cadence, it appears here with its monthly and annual cost and the date of the next payment."
              action={<LinkButton href="/imports/new" variant="primary">Import more history</LinkButton>}
            />
          </Card>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Monthly recurring" minor={summary.monthlyMinor} currency={cur} hint={`${summary.count} detected`} />
              <Stat label="Annual cost" minor={summary.annualMinor} currency={cur} hint="Monthly total × 12" />
              <Stat label="Expected income" minor={income.reduce((s, i) => s + monthlyEquivalent(i.amountMinor, i.cadence, i.intervalDays), 0n)} currency={cur} hint="Recurring, per month" />
              <Stat
                label="Marked unwanted"
                minor={summary.unwantedMonthlyMinor}
                currency={cur}
                hint={summary.unwantedCount > 0 ? `${summary.unwantedCount} subscriptions` : 'None marked yet'}
              />
            </section>

            {priceRises.length > 0 ? (
              <Card>
                <CardHeader title="Price changes" description="Amounts that moved by more than 3%" />
                <CardBody>
                  <ul className="space-y-1.5">
                    {priceRises.map((s) => {
                      const last = s.priceChanges[s.priceChanges.length - 1]!;
                      return (
                        <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-[var(--text-muted)]">
                            {formatMoney(last.fromMinor, cur)} → <strong className="text-[var(--text)]">{formatMoney(last.toMinor, cur)}</strong>
                            <span className="ml-1.5 text-xs text-[var(--text-subtle)]">on {last.date}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHeader
                title="Subscriptions and bills"
                description="Confidence reflects how regular the cadence and amount have been"
              />
              <CardBody className="px-0 pb-0">
                <Table>
                  <thead>
                    <tr>
                      <Th>Name</Th><Th>Category</Th><Th>Cadence</Th><Th>Next</Th>
                      <Th numeric>Amount</Th><Th numeric>Per month</Th><Th numeric>Per year</Th><Th>Confidence</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((s) => {
                      const monthly = monthlyEquivalent(s.amountMinor, s.cadence, s.intervalDays);
                      const cat = s.categoryId ? categoryById.get(s.categoryId) : null;
                      return (
                        <tr key={s.key} className="hover:bg-[var(--surface-2)]">
                          <Td>
                            <span className="block max-w-[24ch] truncate font-medium">{s.name}</span>
                            <span className="text-xs text-[var(--text-subtle)]">{s.occurrenceCount} payments since {s.firstSeenDate}</span>
                          </Td>
                          <Td className="text-[var(--text-muted)]">{cat ? `${cat.icon} ${cat.name}` : '—'}</Td>
                          <Td><Badge tone={s.kind === 'subscription' ? 'accent' : 'neutral'}>{s.cadence}</Badge></Td>
                          <Td className="whitespace-nowrap text-[var(--text-muted)]">{s.nextExpectedDate}</Td>
                          <Td numeric><Money minor={s.amountMinor} currency={cur} size="sm" tone="plain" /></Td>
                          <Td numeric><Money minor={monthly} currency={cur} size="sm" tone="plain" /></Td>
                          <Td numeric className="text-[var(--text-muted)]">{formatMoney(monthly * 12n, cur, { compact: true })}</Td>
                          <Td>
                            <Badge tone={s.confidence >= 80 ? 'positive' : s.confidence >= 60 ? 'neutral' : 'warning'}>
                              {s.confidence}%
                            </Badge>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

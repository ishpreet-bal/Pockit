import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, CardHeader, CardBody, EmptyState, Badge } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { AddSchedule, DeleteSchedule } from './add-schedule';
import { detectRecurring, monthlyEquivalent } from '@/lib/finance/recurring';
import { monthlyCostMinor, CADENCE_LABELS } from '@/lib/finance/schedule';
import { todayIn } from '@/lib/finance/period';
import { formatMoney, sumMinor } from '@/lib/money';

export const metadata: Metadata = { title: 'Recurring' };
export const dynamic = 'force-dynamic';

export default async function RecurringPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;

  const [txns, categories, accounts, manual] = await Promise.all([
    repo.listTransactions(), repo.listCategories(), repo.listAccounts(), repo.listManualSchedules(),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const choices = categories.map((c) => ({
    id: c.id, name: c.name, icon: c.icon, isPrimary: c.parentId === null,
  }));
  const accountChoices = accounts.map((a) => ({ id: a.id, name: a.name }));

  // Two separate systems, shown separately: what the user told us, and what we noticed.
  const detected = detectRecurring(
    txns, today, undefined, new Map(accounts.map((a) => [a.id, a.normalBalance])),
  ).filter((s) => s.kind === 'subscription' || s.kind === 'bill');

  const manualBills = manual.filter((m) => m.direction === 'outflow');
  const manualIncome = manual.filter((m) => m.direction === 'inflow');

  const manualMonthly = sumMinor(manualBills.map(monthlyCostMinor));
  const detectedMonthly = sumMinor(detected.map((s) => monthlyEquivalent(s.amountMinor, s.cadence, s.intervalDays)));
  const totalMonthly = manualMonthly + detectedMonthly;

  const addButton = <AddSchedule categories={choices} accounts={accountChoices} today={today} />;
  const nothingAtAll = manual.length === 0 && detected.length === 0;

  return (
    <>
      <PageHeader
        title="Recurring"
        description="Bills and income that repeat. These feed your calendar, budget and projections."
        action={addButton}
      />

      <div className="space-y-5 px-4 py-4 sm:px-6">
        {nothingAtAll ? (
          <Card>
            <EmptyState
              icon="↻"
              title="No recurring payments yet"
              description="Add the bills you already know about — rent, phone, subscriptions — and Pockit will work them into your calendar and your available-to-spend figure. You don't need any transaction history for this."
              action={addButton}
            />
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <div>
                <p className="text-sm text-[var(--text-muted)]">Recurring bills</p>
                <p className="mt-0.5"><Money minor={totalMonthly} currency={cur} size="xl" tone="plain" /></p>
                <p className="text-xs text-[var(--text-subtle)]">
                  per month · {formatMoney(totalMonthly * 12n, cur, { compact: true })} a year
                </p>
              </div>
              {manualIncome.length > 0 ? (
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Expected income</p>
                  <p className="mt-0.5">
                    <Money minor={sumMinor(manualIncome.map(monthlyCostMinor))} currency={cur} size="xl" tone="plain" />
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">per month</p>
                </div>
              ) : null}
            </div>

            {manual.length > 0 ? (
              <Card>
                <CardHeader title="Your schedule" description="Added by you — always exact" />
                <CardBody className="px-0 pb-0">
                  <ul>
                    {manual.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate text-sm font-medium">
                            {m.name}
                            {m.direction === 'inflow' ? <Badge tone="positive">income</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-[var(--text-subtle)]">
                            {CADENCE_LABELS[m.cadence]}
                            {m.dayOfMonth && (m.cadence === 'monthly' || m.cadence === 'quarterly' || m.cadence === 'annual')
                              ? ` on the ${ordinal(m.dayOfMonth)}` : ''}
                            {m.categoryId ? ` · ${categoryById.get(m.categoryId)?.name ?? ''}` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Money minor={m.amountMinor} currency={cur} size="sm" tone="plain" />
                          <p className="text-xs text-[var(--text-subtle)]">
                            {formatMoney(monthlyCostMinor(m), cur)}/mo
                          </p>
                        </div>
                        <div className="w-20 shrink-0 text-right">
                          <DeleteSchedule id={m.id} name={m.name} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}

            {detected.length > 0 ? (
              <Card>
                <CardHeader
                  title="Spotted in your transactions"
                  description="Patterns Pockit noticed. Add one to your schedule to make it exact."
                />
                <CardBody className="px-0 pb-0">
                  <ul>
                    {detected.map((s) => (
                      <li key={s.key} className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          <p className="truncate text-xs text-[var(--text-subtle)]">
                            {CADENCE_LABELS[s.cadence]} · next around {s.nextExpectedDate}
                            {s.priceChanges.length > 0
                              ? ` · went up to ${formatMoney(s.priceChanges[s.priceChanges.length - 1]!.toMinor, cur)}`
                              : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Money minor={s.amountMinor} currency={cur} size="sm" tone="plain" />
                        </div>
                        <div className="w-20 shrink-0 text-right">
                          <Badge tone={s.confidence >= 80 ? 'positive' : 'neutral'}>{s.confidence}%</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardBody className="pt-4">
                  <p className="text-sm text-[var(--text-muted)]">
                    Pockit also spots repeating payments automatically once it has seen the same charge three times.
                    Nothing found yet — your own schedule above is used in the meantime.
                  </p>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ordinal(n: number): string {
  // 29th-31st are described as "or the last day", because that is what actually
  // happens in February — the schedule clamps rather than skipping the month.
  if (n >= 29) return `${n}th (or the last day)`;
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}


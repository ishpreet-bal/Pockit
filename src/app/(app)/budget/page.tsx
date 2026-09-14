import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, CardHeader, CardBody, EmptyState, ProgressBar, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import { evaluateBudget, type BudgetInput } from '@/lib/finance/budget';
import { todayIn, formatRange } from '@/lib/finance/period';
import { formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Budget' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = { under: 'positive', on_track: 'neutral', approaching: 'warning', over: 'negative' } as const;
const STATUS_LABEL = { under: 'Under pace', on_track: 'On track', approaching: 'Approaching', over: 'Over' } as const;

export default async function BudgetPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);

  const [bundle, categories, txns] = await Promise.all([
    repo.getActiveBudget(), repo.listCategories(), repo.listTransactions(),
  ]);
  const cur = workspace.baseCurrency;

  if (!bundle) {
    return (
      <>
        <PageHeader title="Budget" />
        <div className="px-4 py-8 sm:px-6">
          <Card>
            <EmptyState
              icon="◧"
              title="No budget yet"
              description="Pockit supports category, percentage, zero-based, savings-first, fixed/variable and custom budgeting — and prefills your targets from what you actually spend."
              action={<LinkButton href="/overview" variant="primary">Back to overview</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  const budget: BudgetInput = {
    id: bundle.budget.id,
    name: bundle.budget.name,
    method: bundle.budget.method,
    period: bundle.budget.period,
    periodStart: bundle.budget.periodStart,
    periodDays: bundle.budget.periodDays,
    expectedIncomeMinor: bundle.budget.expectedIncomeMinor === null ? null : BigInt(bundle.budget.expectedIncomeMinor as unknown as string),
    rollover: bundle.budget.rollover,
    allocations: bundle.allocations.map((a) => ({
      id: a.id, categoryId: a.categoryId, bucket: a.bucket, label: a.label,
      amountMinor: a.amountMinor === null ? null : BigInt(a.amountMinor as unknown as string),
      percentBps: a.percentBps,
    })),
  };

  const status = evaluateBudget(budget, txns, categories, today);
  const elapsedPct = Math.round(status.elapsedFraction * 100);

  return (
    <>
      <PageHeader
        title={budget.name}
        description={`${formatRange(status.period, user.locale)} · ${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'} left · ${budget.method.replace('_', ' ')} budgeting`}
      />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Budgeted" minor={status.totalTargetMinor} currency={cur} />
          <Stat label="Spent" minor={status.totalSpentMinor} currency={cur} hint={`${elapsedPct}% of the period has passed`} />
          <Stat label="Remaining" minor={status.totalRemainingMinor} currency={cur} />
          <Stat
            label="Daily allowance left"
            minor={status.daysRemaining > 0 ? status.totalRemainingMinor / BigInt(status.daysRemaining) : 0n}
            currency={cur}
            hint="Remaining divided by days left"
          />
        </section>

        {status.warnings.length > 0 ? (
          <Card>
            <CardHeader title="Notices" description="Factual, not judgemental" />
            <CardBody>
              <ul className="space-y-2">
                {status.warnings.map((w) => (
                  <li key={w.key} className="flex gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: w.severity === 'attention' ? 'var(--negative)' : w.severity === 'notice' ? 'var(--warning)' : 'var(--info)' }} />
                    {w.message}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="By category" description="The marker on each bar shows how much of the period has passed" />
          <CardBody className="space-y-4">
            {status.lines.map((line) => (
              <div key={line.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{line.label || 'Unnamed'}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular text-sm text-[var(--text-muted)]">
                      {formatMoney(line.spentMinor, cur)} / {formatMoney(line.targetMinor, cur)}
                    </span>
                    <Badge tone={STATUS_TONE[line.status]}>{STATUS_LABEL[line.status]}</Badge>
                  </span>
                </div>
                <ProgressBar
                  fraction={Number.isFinite(line.consumedFraction) ? line.consumedFraction : 1}
                  markerFraction={status.elapsedFraction}
                  tone={line.status === 'over' ? 'negative' : line.status === 'approaching' ? 'warning' : 'accent'}
                  className="mt-1.5"
                />
                <div className="mt-1 flex justify-between text-xs text-[var(--text-subtle)]">
                  <span>
                    {Number.isFinite(line.consumedFraction) ? `${Math.round(line.consumedFraction * 100)}% used` : 'No budget set'}
                    {' · '}
                    <Money minor={line.remainingMinor} currency={cur} size="sm" tone="auto" /> left
                  </span>
                  <span>
                    Projected {formatMoney(line.projectedMinor, cur)}
                    {line.projectedOverageMinor > 0n ? ` (${formatMoney(line.projectedOverageMinor, cur)} over)` : ''}
                  </span>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

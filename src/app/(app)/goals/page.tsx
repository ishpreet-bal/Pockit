import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, CardHeader, CardBody, EmptyState, ProgressBar, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import {
  computeGoalMath, computeCashFlowBasis, assessFeasibility, summarizeGoals, type GoalInput,
} from '@/lib/finance/goals';
import { todayIn, startOfMonth, addMonths } from '@/lib/finance/period';
import { formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Goals' };
export const dynamic = 'force-dynamic';

export default async function GoalsPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;

  const [rows, txns, categories] = await Promise.all([
    repo.listGoals(), repo.listTransactions(), repo.listCategories(),
  ]);

  const goals: GoalInput[] = rows.map((g) => ({
    id: g.id, name: g.name,
    targetMinor: BigInt(g.targetMinor as unknown as string),
    currentMinor: BigInt(g.currentMinor as unknown as string),
    targetDate: g.targetDate, priority: g.priority,
    monthlyContributionMinor: g.monthlyContributionMinor === null ? null : BigInt(g.monthlyContributionMinor as unknown as string),
  }));

  const basis = computeCashFlowBasis(txns, { start: startOfMonth(addMonths(today, -2)), end: today }, 3);
  const portfolio = summarizeGoals(goals, basis, today);

  if (goals.length === 0) {
    return (
      <>
        <PageHeader title="Goals" />
        <div className="px-4 py-8 sm:px-6">
          <Card>
            <EmptyState
              icon="◆"
              title="No goals yet"
              description="Set a target amount and date. Pockit works out what you need to save each month, and checks it against the cash flow you actually have."
              action={<LinkButton href="/overview" variant="primary">Back to overview</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Goals"
        description={`Feasibility is checked against your last ${basis.months} months of income and spending.`}
      />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Saved so far" minor={portfolio.totalSavedMinor} currency={cur} />
          <Stat label="Total target" minor={portfolio.totalTargetMinor} currency={cur} />
          <Stat label="Needed monthly" minor={portfolio.totalRequiredMonthlyMinor} currency={cur}
            hint="Across all active goals" />
          <Stat label="Available monthly" minor={portfolio.availableMinor} currency={cur}
            hint={portfolio.overcommitted ? 'Less than your goals require' : 'Covers your goals'} />
        </section>

        {portfolio.overcommitted ? (
          <Card>
            <CardBody className="pt-4">
              <p className="text-sm">
                Your goals together need{' '}
                <strong>{formatMoney(portfolio.totalRequiredMonthlyMinor, cur)}</strong> per month, which is more than
                the <strong>{formatMoney(portfolio.availableMinor, cur)}</strong> your recent cash flow has provided.
                The goals below show what that means individually.
              </p>
              <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                This is an estimate from your own records over the last {basis.months} months, not financial advice.
              </p>
            </CardBody>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((goal) => {
            const math = computeGoalMath(goal, today);
            const otherCommitments = goals
              .filter((g) => g.id !== goal.id)
              .reduce((sum, g) => sum + (g.monthlyContributionMinor ?? 0n), 0n);
            const feasibility = assessFeasibility(goal, math, basis, txns, categories, today, otherCommitments);

            return (
              <Card key={goal.id}>
                <CardHeader
                  title={goal.name}
                  action={
                    math.isAchieved ? <Badge tone="positive">Achieved</Badge>
                    : feasibility.feasible ? <Badge tone="positive">On track</Badge>
                    : <Badge tone="warning">Needs adjustment</Badge>
                  }
                />
                <CardBody>
                  <div className="flex items-baseline justify-between gap-2">
                    <Money minor={goal.currentMinor} currency={cur} size="lg" tone="plain" />
                    <span className="text-sm text-[var(--text-muted)]">of {formatMoney(goal.targetMinor, cur)}</span>
                  </div>
                  <ProgressBar fraction={math.progressFraction} className="mt-2" tone={math.isAchieved ? 'positive' : 'accent'} />

                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 text-center">
                    <div>
                      <dt className="text-xs text-[var(--text-muted)]">Remaining</dt>
                      <dd className="mt-0.5"><Money minor={math.remainingMinor} currency={cur} size="sm" tone="plain" /></dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-muted)]">Months left</dt>
                      <dd className="tabular mt-0.5 text-sm font-medium">{math.monthsRemaining ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-muted)]">Needed / mo</dt>
                      <dd className="mt-0.5">
                        {math.requiredMonthlyMinor !== null
                          ? <Money minor={math.requiredMonthlyMinor} currency={cur} size="sm" tone="plain" />
                          : <span className="text-sm text-[var(--text-subtle)]">—</span>}
                      </dd>
                    </div>
                  </dl>

                  {math.requiredMonthlyMinor !== null ? (
                    <p className="mt-2 text-xs text-[var(--text-subtle)]">
                      Equivalent to {formatMoney(math.requiredBiweeklyMinor ?? 0n, cur)} biweekly
                      or {formatMoney(math.requiredWeeklyMinor ?? 0n, cur)} weekly.
                    </p>
                  ) : null}

                  {!math.isAchieved ? (
                    <div className="mt-3 rounded-[var(--radius-control)] bg-[var(--surface-2)] p-3">
                      <p className="text-sm">{feasibility.explanation}</p>

                      {feasibility.adjustments.length > 0 ? (
                        <>
                          <p className="mt-2.5 text-xs font-medium uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                            One way to close the gap
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {feasibility.adjustments.map((adj) => (
                              <li key={adj.categoryId} className="flex justify-between gap-2 text-sm">
                                <span className="text-[var(--text-muted)]">
                                  Reduce {adj.categoryName.toLowerCase()} by {Math.round(adj.reductionFraction * 100)}%
                                </span>
                                <span className="tabular">−{formatMoney(adj.suggestedReductionMinor, cur)}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 text-sm font-medium">
                            <span>Available after these changes</span>
                            <Money minor={feasibility.adjustedAvailableMinor} currency={cur} size="sm" tone="plain" />
                          </p>
                        </>
                      ) : null}

                      {feasibility.achievableDate ? (
                        <p className="mt-2 text-xs text-[var(--text-subtle)]">
                          At your current available cash flow, this goal would be reached around {feasibility.achievableDate}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}

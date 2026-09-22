import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, CardHeader, CardBody, EmptyState, ProgressBar, Badge, LinkButton } from '@/components/ui/primitives';
import { TimelineSlider } from './timeline-slider';
import { Money } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import {
  computeGoalMath, computeCashFlowBasis, assessFeasibility, summarizeGoals,
  computeGoalPace, type GoalInput,
} from '@/lib/finance/goals';
import { todayIn, startOfMonth, addMonths } from '@/lib/finance/period';
import { inferKind, kindFindings } from '@/lib/finance/goal-kinds';
import { AskPockButton } from '@/components/brand/ask-pock-button';
import { cn } from '@/lib/ui/cn';
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
        <section data-tour="goals-summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

        <div data-tour="goals-list" className="grid gap-4 lg:grid-cols-2">
          {goals.map((goal) => {
            const math = computeGoalMath(goal, today);
            // Pace uses what is actually going in, not what was planned.
            const pace = computeGoalPace(goal, math, goal.monthlyContributionMinor ?? 0n, today, cur);
            const otherCommitments = goals
              .filter((g) => g.id !== goal.id)
              .reduce((sum, g) => sum + (g.monthlyContributionMinor ?? 0n), 0n);
            const feasibility = assessFeasibility(goal, math, basis, txns, categories, today, otherCommitments);

            // The per-goal analysis. `kind` has been in the schema since the start
            // and was never read, which is precisely why every goal produced the
            // same commentary — nothing in the pipeline asked what it was looking at.
            const kind = inferKind(goal.name, goal.kind ?? null);
            const findings = kindFindings({
              kind,
              name: goal.name,
              targetMinor: goal.targetMinor,
              currentMinor: goal.currentMinor,
              targetDate: goal.targetDate ?? null,
              monthlyOutgoingsMinor: basis.averageExpensesMinor > 0n ? basis.averageExpensesMinor : null,
              requiredMonthlyMinor: math.requiredMonthlyMinor,
              availableMonthlyMinor: feasibility.availableMinor,
              today,
            });

            return (
              <Card key={goal.id}>
                <CardHeader
                  title={goal.name}
                  action={
                    pace.status === 'achieved' ? <Badge tone="positive">Reached</Badge>
                    : pace.status === 'ahead' ? <Badge tone="positive">Ahead</Badge>
                    : pace.status === 'behind' ? <Badge tone="warning">Behind</Badge>
                    : pace.status === 'stalled' ? <Badge tone="neutral">Not started</Badge>
                    : <Badge tone="positive">On track</Badge>
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

                  {/* What is actually happening, not just what was planned. */}
                  <p className="mt-2.5 text-sm">{pace.headline}</p>
                  {pace.projectedDate && pace.status !== 'achieved' ? (
                    <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                      At your current pace, you reach it around{' '}
                      {new Date(`${pace.projectedDate}T12:00:00Z`).toLocaleDateString(user.locale, {
                        month: 'long', year: 'numeric', timeZone: 'UTC',
                      })}.
                    </p>
                  ) : null}
                  {pace.suggestion ? (
                    <p className="mt-2 rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                      {pace.suggestion.text}
                    </p>
                  ) : null}
                  {math.requiredMonthlyMinor !== null ? (
                    <p className="mt-2 text-xs text-[var(--text-subtle)]">
                      Or {formatMoney(math.requiredBiweeklyMinor ?? 0n, cur)} every two weeks
                      · {formatMoney(math.requiredWeeklyMinor ?? 0n, cur)} weekly.
                    </p>
                  ) : null}

                  {/* Opens Pock already knowing which goal — no "which one?" round trip. */}
                  <AskPockButton
                    className="mt-2"
                    anchor={{ kind: 'goal', id: goal.id, label: goal.name }}
                    label="Ask Pock about this goal"
                    prompt={`How am I doing on ${goal.name}?`}
                  />

                  {!math.isAchieved ? (
                    <TimelineSlider
                      remainingMinor={Number(math.remainingMinor)}
                      currency={cur}
                      initialMonths={math.monthsRemaining ?? math.projectedMonths ?? 12}
                      affordableMonthlyMinor={Number(feasibility.availableMinor)}
                      locale={user.locale}
                    />
                  ) : null}

                  {findings.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {findings.map((finding) => (
                        <li
                          key={finding.text}
                          className={cn(
                            'rounded-[var(--radius-control)] px-3 py-2 text-sm',
                            finding.tone === 'caution'
                              ? 'bg-[var(--warning-soft)] text-[var(--text)]'
                              : finding.tone === 'good'
                                ? 'bg-[var(--positive-soft)] text-[var(--text)]'
                                : 'bg-[var(--surface-2)] text-[var(--text-muted)]',
                          )}
                        >
                          {finding.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {!math.isAchieved ? (
                    <div className="mt-3 rounded-[var(--radius-control)] bg-[var(--surface-2)] p-3">
                      <p className="text-sm">{feasibility.explanation}</p>

                      {/*
                        The list of cuts is shown ONLY when it would actually work.
                        When it would not, every goal produces the same eight rows —
                        same categories, same amounts, because it is simply every
                        discretionary category at its cap — and repeating that
                        identical block under three different goals is the noise
                        that made them all read alike. The sentence below says the
                        useful thing instead.
                      */}
                      {feasibility.adjustments.length > 0 && feasibility.adjustmentsCoverGap ? (
                        <>
                          {/*
                            The heading tells the truth about its own list.
                            When the shortfall is bigger than everything that can be
                            cut, the algorithm cuts every discretionary category to
                            its cap — producing the SAME list for every goal, headed
                            "one way to close the gap" while closing nothing. Three
                            goals showed byte-identical advice for exactly this reason.
                          */}
                          <p className="mt-2.5 text-xs font-medium uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                            {feasibility.adjustmentsCoverGap
                              ? 'One way to close the gap'
                              : 'Cutting everything discretionary still is not enough'}
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

                      {!feasibility.adjustmentsCoverGap && feasibility.shortfallMinor > 0n ? (
                        <p className="mt-2 rounded-[var(--radius-control)] bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--text)]">
                          Trimming every discretionary category by the most this suggests would recover
                          about{' '}
                          <Money
                            minor={feasibility.shortfallMinor - feasibility.stillShortMinor}
                            currency={cur}
                            size="sm"
                            tone="plain"
                          />{' '}
                          a month and still leave you{' '}
                          <Money minor={feasibility.stillShortMinor} currency={cur} size="sm" tone="plain" /> short.
                          Spending is not the lever for this one — the target amount or the date is. The slider
                          above shows what a later date would cost.
                        </p>
                      ) : null}

                      {feasibility.achievableDate ? (
                        <p className="mt-2 text-xs text-[var(--text-subtle)]">
                          At your current available cash flow, this goal would be reached around{' '}
                          {new Date(`${feasibility.achievableDate}T12:00:00Z`).toLocaleDateString(user.locale, {
                            month: 'long', year: 'numeric', timeZone: 'UTC',
                          })}.
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

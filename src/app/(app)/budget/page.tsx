import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, CardBody, EmptyState, ProgressBar, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { evaluateBudget, type BudgetInput } from '@/lib/finance/budget';
import { computePosition } from '@/lib/finance/position';
import { detectRecurring } from '@/lib/finance/recurring';
import { manualScheduleToSeries } from '@/lib/finance/schedule';
import { todayIn, startOfMonth, endOfMonth } from '@/lib/finance/period';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export const metadata: Metadata = { title: 'Budget' };
export const dynamic = 'force-dynamic';

export default async function BudgetPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;
  const period = { start: startOfMonth(today), end: endOfMonth(today) };

  const [bundle, categories, txns, accounts, manual] = await Promise.all([
    repo.getActiveBudget(), repo.listCategories(), repo.listTransactions(),
    repo.listAccounts(), repo.listManualSchedules(),
  ]);

  if (!bundle) {
    return (
      <>
        <PageHeader title="Budget" />
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <Card>
            <CardBody className="pt-6">
              <h2 className="text-lg font-semibold">Let Pockit suggest a budget</h2>
              <p className="mt-1.5 text-sm text-[var(--text-muted)]">
                You won&rsquo;t be handed a blank form. Answer what you&rsquo;re trying to achieve, check two
                numbers, and Pockit builds a plan from your income and the bills it already knows about —
                then explains every line so you can adjust it.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-[var(--text-muted)]">
                {['Takes about a minute', 'Works even with no spending history', 'Every number is yours to change'].map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <span className="text-[var(--accent)]" aria-hidden>✓</span> {p}
                  </li>
                ))}
              </ul>
              <LinkButton href="/budget/setup" variant="primary" className="mt-5">Build my budget</LinkButton>
            </CardBody>
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

  const status = evaluateBudget(budget, txns, categories, today, period);

  const series = [
    ...manual.filter((m) => m.isActive).map((m) => manualScheduleToSeries(m, today)),
    ...detectRecurring(txns, today, undefined, new Map(accounts.map((a) => [a.id, a.normalBalance]))),
  ];
  const position = computePosition({
    txns, accounts, categories, series, today, currency: cur, period,
  });

  const elapsedPct = Math.round(status.elapsedFraction * 100);
  const spentPct = status.totalTargetMinor > 0n
    ? Number(status.totalSpentMinor) / Number(status.totalTargetMinor) : 0;
  const onPace = spentPct <= status.elapsedFraction + 0.05;

  return (
    <>
      <PageHeader
        title="Budget"
        description={`${status.daysRemaining} days left this month`}
        action={<LinkButton href="/budget/setup" size="sm">Change plan</LinkButton>}
      />

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {/* One sentence, not a wall of numbers. */}
        <section>
          <p className="text-sm text-[var(--text-muted)]">
            {onPace ? 'You’re on pace' : 'You’re spending faster than the month is passing'}
          </p>
          <p className="mt-1">
            <Money minor={status.totalSpentMinor} currency={cur} size="xl" tone="plain" className="text-3xl" />
            <span className="ml-1 text-base text-[var(--text-muted)]">
              of {formatMoney(status.totalTargetMinor, cur)}
            </span>
          </p>
          <ProgressBar
            className="mt-3"
            fraction={spentPct}
            markerFraction={status.elapsedFraction}
            tone={status.totalRemainingMinor < 0n ? 'negative' : onPace ? 'accent' : 'warning'}
          />
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            {status.totalRemainingMinor >= 0n
              ? <>
                  <strong className="text-[var(--text)]">{formatMoney(status.totalRemainingMinor, cur)}</strong> left,
                  and {elapsedPct}% of the month has passed.
                  {status.daysRemaining > 0
                    ? ` That’s about ${formatMoney(status.totalRemainingMinor / BigInt(Math.max(1, status.daysRemaining)), cur)} a day.`
                    : ''}
                </>
              : <>You are <strong className="text-[var(--negative)]">{formatMoney(-status.totalRemainingMinor, cur)}</strong> over your plan with {status.daysRemaining} days to go.</>}
          </p>
        </section>

        {/* Bills the budget assumes, so the plan is not read in isolation. */}
        {position.committedMinor > 0n ? (
          <Link href="/transactions?view=upcoming"
            className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3.5 py-3 transition-colors hover:bg-[var(--surface-3)]">
            <span className="text-sm">
              <strong>{formatMoney(position.committedMinor, cur)}</strong> of bills still to pay this month
            </span>
            <span className="shrink-0 text-xs text-[var(--accent)]">See them →</span>
          </Link>
        ) : null}

        <section>
          <h2 className="mb-2 text-base font-semibold">Your plan</h2>
          <Card>
            <CardBody className="space-y-4 pt-4">
              {status.lines.map((line) => {
                const fraction = Number.isFinite(line.consumedFraction) ? line.consumedFraction : 0;
                return (
                  <div key={line.key}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-sm font-medium">{line.label || 'Unnamed'}</span>
                      <span className="tabular text-sm text-[var(--text-muted)]">
                        {formatMoney(line.spentMinor, cur)} / {formatMoney(line.targetMinor, cur)}
                      </span>
                    </div>
                    <ProgressBar
                      className="mt-1.5"
                      fraction={fraction}
                      markerFraction={status.elapsedFraction}
                      tone={line.status === 'over' ? 'negative' : line.status === 'approaching' ? 'warning' : 'accent'}
                    />
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      {line.targetMinor > 0n
                        ? `${Math.round(fraction * 100)}% used · ${formatMoney(line.remainingMinor, cur)} left`
                        : 'No amount set'}
                    </p>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </section>

        {/* Contextual actions, only when there is something to act on. */}
        {status.warnings.length > 0 ? (
          <section>
            <h2 className="mb-2 text-base font-semibold">Worth a look</h2>
            <ul className="space-y-2">
              {status.warnings.slice(0, 3).map((w) => (
                <li key={w.key} className="rounded-[var(--radius-control)] border border-[var(--border)] p-3.5">
                  <p className="text-sm">{w.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <LinkButton href="/budget/setup" size="sm">Adjust the plan</LinkButton>
                    {w.categoryId ? (
                      <LinkButton href={`/transactions?category=${w.categoryId}`} size="sm">
                        See those transactions
                      </LinkButton>
                    ) : (
                      <LinkButton href="/transactions" size="sm">See transactions</LinkButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {status.lines.length === 0 ? (
          <Card>
            <EmptyState
              title="This budget has no lines yet"
              description="Rebuild it and Pockit will suggest amounts from your income and bills."
              action={<LinkButton href="/budget/setup" variant="primary">Rebuild</LinkButton>}
            />
          </Card>
        ) : null}

        <p className={cn('text-xs text-[var(--text-subtle)]')}>
          {bundle.budget.intent
            ? `This plan is set up around: ${intentLabel(bundle.budget.intent)}.`
            : 'Spending is compared against what you planned, not against a generic rule.'}
        </p>
      </div>
    </>
  );
}

function intentLabel(intent: string): string {
  const map: Record<string, string> = {
    control_spending: 'understanding and controlling spending',
    save_more: 'saving more each month',
    emergency_fund: 'building an emergency fund',
    pay_down_debt: 'paying down debt',
    invest_more: 'investing more',
    big_purchase: 'saving for something specific',
    balanced: 'a balanced monthly plan',
  };
  return map[intent] ?? intent.replace(/_/g, ' ');
}


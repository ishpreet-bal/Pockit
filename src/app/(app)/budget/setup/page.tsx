import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../../page-header';
import { BudgetWizard } from './wizard';
import { derivePlanContext } from '@/lib/finance/budget-plan';
import { monthlyCostMinor } from '@/lib/finance/schedule';
import { detectRecurring, monthlyEquivalent } from '@/lib/finance/recurring';
import { todayIn, startOfMonth, addMonths } from '@/lib/finance/period';
import { sumMinor } from '@/lib/money';
import { getAiProvider } from '@/lib/ai';

export const metadata: Metadata = { title: 'Set up your budget' };
export const dynamic = 'force-dynamic';

export default async function BudgetSetupPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);

  const [txns, categories, accounts, manual, goals, debts] = await Promise.all([
    repo.listTransactions(), repo.listCategories(), repo.listAccounts(),
    repo.listManualSchedules(), repo.listGoals(), repo.listDebts(),
  ]);

  // Everything the wizard can work out for itself, so the user is asked as little as
  // possible. Questions are a last resort, not the starting point.
  const context = derivePlanContext(txns, categories, {
    start: startOfMonth(addMonths(today, -2)), end: today,
  });

  const manualBills = manual.filter((m) => m.direction === 'outflow' && m.isActive);
  const manualIncome = manual.filter((m) => m.direction === 'inflow' && m.isActive);
  const detected = detectRecurring(
    txns, today, undefined, new Map(accounts.map((a) => [a.id, a.normalBalance])),
  ).filter((s) => s.kind === 'subscription' || s.kind === 'bill');

  const fixedFromManual = sumMinor(manualBills.map(monthlyCostMinor));
  const fixedFromDetected = sumMinor(detected.map((s) => monthlyEquivalent(s.amountMinor, s.cadence, s.intervalDays)));

  const incomeFromSchedules = sumMinor(manualIncome.map(monthlyCostMinor));
  const knownIncome = incomeFromSchedules > 0n ? incomeFromSchedules : context.monthlyIncomeMinor;

  // Prefills for the debt branch. Asking someone to look up a balance the app
  // already holds is how a wizard earns a reputation for being tedious.
  const debtTotal = sumMinor(debts.map((d) => BigInt(d.balanceMinor as unknown as string)));
  const debtMinimum = sumMinor(debts.map((d) => BigInt(d.minPaymentMinor as unknown as string)));

  const provider = getAiProvider();
  const assistantAvailable = provider.capabilities.tools;

  const goalCommitment = sumMinor(
    goals.map((g) => (g.monthlyContributionMinor === null ? 0n : BigInt(g.monthlyContributionMinor as unknown as string))),
  );

  return (
    <>
      <PageHeader
        title="Set up your budget"
        description="Pockit asks only what it cannot work out for itself, and the questions depend on what you are trying to do."
      />
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        <BudgetWizard
          currency={workspace.baseCurrency}
          knownIncomeMinor={knownIncome.toString()}
          knownFixedMinor={(fixedFromManual + fixedFromDetected).toString()}
          goalCommitmentMinor={goalCommitment.toString()}
          monthsOfHistory={context.monthsOfHistory}
          hasHistory={txns.length > 0}
          billCount={manualBills.length + detected.length}
          historicalEssentials={serialiseEssentials(context.historicalByCategory, categories)}
          debtTotalMinor={debtTotal.toString()}
          debtMinimumMinor={debtMinimum.toString()}
          monthlyExpensesMinor={context.monthlyExpensesMinor.toString()}
          assistantAvailable={assistantAvailable}
        />
      </div>
    </>
  );
}

function serialiseEssentials(
  byCategory: Map<string, bigint>,
  categories: { id: string; necessity: string; kind: string }[],
): string {
  const essential = new Set(
    categories.filter((c) => c.necessity === 'essential' && c.kind === 'expense').map((c) => c.id),
  );
  let total = 0n;
  for (const [id, amount] of byCategory) if (essential.has(id)) total += amount;
  return total.toString();
}

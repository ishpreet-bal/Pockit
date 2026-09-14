/**
 * Debt payoff simulation (spec §20).
 *
 * Simulates month by month rather than using a closed-form formula, because the
 * closed form cannot express the snowball effect: when one debt clears, its payment
 * rolls into the next. The simulation also naturally handles a rate of 0% and a
 * payment too small to cover interest, both of which break the analytic formula.
 */
import { mulRatio, sumMinor } from '@/lib/money';
import type { IsoDate } from './types';
import { addMonths } from './period';

export type PayoffStrategy = 'avalanche' | 'snowball' | 'custom';

export interface DebtInput {
  id: string;
  name: string;
  balanceMinor: bigint;
  /** Annual rate in basis points. 1999 = 19.99%. */
  aprBps: number;
  minPaymentMinor: bigint;
  strategyOrder: number;
}

export interface DebtPayoffMonth {
  month: number;
  date: IsoDate;
  startingBalanceMinor: bigint;
  interestMinor: bigint;
  principalMinor: bigint;
  paymentMinor: bigint;
  endingBalanceMinor: bigint;
  clearedDebtIds: string[];
}

export interface DebtPayoffResult {
  strategy: PayoffStrategy;
  months: number;
  payoffDate: IsoDate | null;
  totalPaidMinor: bigint;
  totalInterestMinor: bigint;
  schedule: DebtPayoffMonth[];
  perDebt: { id: string; name: string; months: number; interestMinor: bigint; payoffDate: IsoDate | null }[];
  /** True when the monthly budget cannot cover the minimum payments plus interest. */
  neverPaysOff: boolean;
}

const MAX_MONTHS = 600; // 50 years — beyond this, report "never pays off"

/**
 * @param monthlyBudgetMinor Total available each month across all debts. Must be at
 *        least the sum of minimum payments for the simulation to make progress.
 */
export function simulatePayoff(
  debts: readonly DebtInput[],
  monthlyBudgetMinor: bigint,
  strategy: PayoffStrategy,
  today: IsoDate,
): DebtPayoffResult {
  const active = debts
    .filter((d) => d.balanceMinor > 0n)
    .map((d) => ({ ...d, balance: d.balanceMinor, interestPaid: 0n, clearedMonth: null as number | null }));

  if (active.length === 0) {
    return {
      strategy, months: 0, payoffDate: today, totalPaidMinor: 0n, totalInterestMinor: 0n,
      schedule: [], perDebt: [], neverPaysOff: false,
    };
  }

  const order = orderDebts(active, strategy);
  const schedule: DebtPayoffMonth[] = [];
  let totalInterest = 0n;
  let totalPaid = 0n;
  let month = 0;

  while (month < MAX_MONTHS && order.some((d) => d.balance > 0n)) {
    month++;
    const startingBalance = sumMinor(order.map((d) => d.balance));
    let budget = monthlyBudgetMinor;
    let monthInterest = 0n;
    let monthPrincipal = 0n;
    const cleared: string[] = [];

    // 1. Accrue a month of interest on every outstanding debt.
    for (const d of order) {
      if (d.balance <= 0n) continue;
      const interest = mulRatio(d.balance, BigInt(d.aprBps), 120_000n); // apr/12, in bps
      d.balance += interest;
      d.interestPaid += interest;
      monthInterest += interest;
    }
    totalInterest += monthInterest;

    // 2. Pay the minimum on everything, so nothing goes delinquent.
    for (const d of order) {
      if (d.balance <= 0n) continue;
      const payment = min(min(d.minPaymentMinor, d.balance), budget);
      if (payment <= 0n) continue;
      d.balance -= payment;
      budget -= payment;
      monthPrincipal += payment;
      if (d.balance <= 0n) {
        d.balance = 0n;
        d.clearedMonth ??= month;
        cleared.push(d.id);
      }
    }

    // 3. Everything left goes to the target debt — this is the snowball/avalanche.
    for (const d of order) {
      if (budget <= 0n) break;
      if (d.balance <= 0n) continue;
      const extra = min(budget, d.balance);
      d.balance -= extra;
      budget -= extra;
      monthPrincipal += extra;
      if (d.balance <= 0n) {
        d.balance = 0n;
        d.clearedMonth ??= month;
        if (!cleared.includes(d.id)) cleared.push(d.id);
      }
    }

    const paidThisMonth = monthlyBudgetMinor - budget;
    totalPaid += paidThisMonth;

    schedule.push({
      month,
      date: addMonths(today, month),
      startingBalanceMinor: startingBalance,
      interestMinor: monthInterest,
      principalMinor: monthPrincipal - monthInterest > 0n ? monthPrincipal - monthInterest : monthPrincipal,
      paymentMinor: paidThisMonth,
      endingBalanceMinor: sumMinor(order.map((d) => d.balance)),
      clearedDebtIds: cleared,
    });

    // The budget does not even cover the interest: the balance is growing.
    if (paidThisMonth <= monthInterest && month > 1) {
      const prev = schedule[schedule.length - 2];
      if (prev && schedule[schedule.length - 1]!.endingBalanceMinor >= prev.endingBalanceMinor) {
        return {
          strategy, months: month, payoffDate: null,
          totalPaidMinor: totalPaid, totalInterestMinor: totalInterest, schedule,
          perDebt: order.map((d) => ({ id: d.id, name: d.name, months: 0, interestMinor: d.interestPaid, payoffDate: null })),
          neverPaysOff: true,
        };
      }
    }
  }

  const cleared = order.every((d) => d.balance <= 0n);

  return {
    strategy,
    months: month,
    payoffDate: cleared ? addMonths(today, month) : null,
    totalPaidMinor: totalPaid,
    totalInterestMinor: totalInterest,
    schedule,
    perDebt: order.map((d) => ({
      id: d.id,
      name: d.name,
      months: d.clearedMonth ?? 0,
      interestMinor: d.interestPaid,
      payoffDate: d.clearedMonth ? addMonths(today, d.clearedMonth) : null,
    })),
    neverPaysOff: !cleared,
  };
}

function orderDebts<T extends DebtInput & { balance: bigint }>(debts: T[], strategy: PayoffStrategy): T[] {
  const copy = [...debts];
  switch (strategy) {
    case 'avalanche':
      // Highest interest first: mathematically cheapest.
      return copy.sort((a, b) => b.aprBps - a.aprBps || Number(a.balance - b.balance));
    case 'snowball':
      // Smallest balance first: clears debts soonest, which sustains momentum.
      return copy.sort((a, b) => Number(a.balance - b.balance) || b.aprBps - a.aprBps);
    case 'custom':
      return copy.sort((a, b) => a.strategyOrder - b.strategyOrder);
  }
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export interface StrategyComparison {
  avalanche: DebtPayoffResult;
  snowball: DebtPayoffResult;
  /** Interest saved by avalanche versus snowball. May be negative. */
  interestDifferenceMinor: bigint;
  monthsDifference: number;
}

export function compareStrategies(
  debts: readonly DebtInput[],
  monthlyBudgetMinor: bigint,
  today: IsoDate,
): StrategyComparison {
  const avalanche = simulatePayoff(debts, monthlyBudgetMinor, 'avalanche', today);
  const snowball = simulatePayoff(debts, monthlyBudgetMinor, 'snowball', today);
  return {
    avalanche,
    snowball,
    interestDifferenceMinor: snowball.totalInterestMinor - avalanche.totalInterestMinor,
    monthsDifference: snowball.months - avalanche.months,
  };
}

/** The minimum monthly budget that makes any progress: minimums plus first-month interest. */
export function minimumViableBudget(debts: readonly DebtInput[]): bigint {
  return sumMinor(
    debts.filter((d) => d.balanceMinor > 0n).map((d) => {
      const interest = mulRatio(d.balanceMinor, BigInt(d.aprBps), 120_000n);
      return d.minPaymentMinor > interest ? d.minPaymentMinor : interest + 100n;
    }),
  );
}

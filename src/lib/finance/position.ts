/**
 * THE canonical "where do I stand" calculation.
 *
 * Every screen that shows available money derives it from here. Before this existed,
 * the dashboard, the budget and the forecast each worked it out slightly differently,
 * and a transaction dated next month was counted as already spent — so money the user
 * had planned to pay silently vanished from their balance.
 *
 * The model, stated once:
 *
 *     posted      money that has actually moved (date <= today)
 *     scheduled   money the user has committed but that has not moved yet
 *
 *     leftThisPeriod = (income received + income expected)
 *                      − spent so far
 *                      − committed but not yet paid
 *
 *     availableNow   = cash in hand − committed but not yet paid
 *
 * `availableNow` is the headline figure: what is actually free once the bills the user
 * already knows about are covered.
 */
import { sumMinor, absMinor } from '@/lib/money';
import type { DateRange, IsoDate, LedgerTxn, LedgerAccount, LedgerCategory } from './types';
import { spendingAmount, incomeAmount, isInternalTransfer, cashPosition, allAccountBalances } from './ledger';
import { endOfMonth, startOfMonth, diffDays, addDays } from './period';
import { upcomingOccurrences, isExternalCashMovement, type DetectedSeries } from './recurring';

/** Has this transaction actually happened, or is it a plan? */
export function isScheduled(txn: Pick<LedgerTxn, 'postedDate'>, today: IsoDate): boolean {
  return txn.postedDate > today;
}

export interface CommittedItem {
  date: IsoDate;
  name: string;
  amountMinor: bigint;
  /** 'entered' = the user created this transaction; 'recurring' = projected from a series. */
  origin: 'entered' | 'recurring';
  kind: 'bill' | 'income' | 'saving';
  categoryId: string | null;
  transactionId?: string;
  seriesKey?: string;
}

export interface MoneyPosition {
  today: IsoDate;
  period: DateRange;
  currency: string;

  /** Money that has actually arrived this period. */
  incomeReceivedMinor: bigint;
  /** Money expected before the period ends: future-dated income plus recurring income. */
  incomeExpectedMinor: bigint;

  /** Spending that has actually happened this period, net of refunds. */
  spentMinor: bigint;
  /** Bills the user has committed to but not yet paid, before the period ends. */
  committedMinor: bigint;

  /** Everyday money right now (chequing and cash, minus card balances owed), counting only money that has actually moved. */
  cashNowMinor: bigint;
  /**
   * The headline number: cash in hand minus what is already spoken for.
   * Negative means the known bills exceed the cash on hand.
   */
  availableNowMinor: bigint;

  /** Income minus everything spent and committed, across the whole period. */
  leftThisPeriodMinor: bigint;

  /** What's owed on credit cards right now; already taken out of cashNowMinor. */
  cardsOwedMinor: bigint;
  /** The next pay that's expected, if one is known. */
  nextPayday: IsoDate | null;
  /** Bills due from today up to the next payday (or the end of the month when no payday is known). */
  dueBeforePaydayMinor: bigint;

  /** Commitments falling inside the period, used for the period maths. */
  commitments: CommittedItem[];
  /**
   * Commitments over the next `lookaheadDays`, regardless of month boundary.
   *
   * "What is coming" is not a calendar-month question. Adding rent due on the 1st on
   * the 16th used to show no effect anywhere, because the next occurrence fell outside
   * the current month — the user did the right thing and saw nothing happen.
   */
  soonCommitments: CommittedItem[];
  lookaheadDays: number;

  /** True when nothing has been committed — used to avoid alarming empty states. */
  hasCommitments: boolean;
  daysLeftInPeriod: number;
}

export interface PositionInput {
  txns: readonly LedgerTxn[];
  accounts: readonly LedgerAccount[];
  categories: readonly LedgerCategory[];
  series: readonly DetectedSeries[];
  today: IsoDate;
  currency: string;
  /** Defaults to the current calendar month. */
  period?: DateRange;
  /** How far ahead "coming up" looks. Defaults to 30 days. */
  lookaheadDays?: number;
}

export function computePosition(input: PositionInput): MoneyPosition {
  const { txns, accounts, series, today, currency } = input;
  const period = input.period ?? { start: startOfMonth(today), end: endOfMonth(today) };
  const lookaheadDays = input.lookaheadDays ?? 30;
  const lookaheadEnd = addDays(today, lookaheadDays);

  let incomeReceived = 0n;
  let incomeExpected = 0n;
  let spent = 0n;
  const commitments: CommittedItem[] = [];

  const categoryById = new Map(input.categories.map((c) => [c.id, c]));

  const windowEnd = lookaheadEnd > period.end ? lookaheadEnd : period.end;

  for (const t of txns) {
    if (t.postedDate < period.start || t.postedDate > windowEnd) continue;
    if (isInternalTransfer(t)) continue;

    if (isScheduled(t, today)) {
      // A transaction the user entered for a future date is a COMMITMENT, not a
      // completed payment. Counting it as spent was the original bug.
      const income = incomeAmount(t);
      if (income > 0n) {
        if (t.postedDate <= period.end) incomeExpected += income;
        commitments.push({
          date: t.postedDate,
          name: t.merchantName ?? t.description,
          amountMinor: income,
          origin: 'entered',
          kind: 'income',
          categoryId: t.categoryId,
          transactionId: t.id,
        });
      } else {
        const amount = absMinor(spendingAmount(t)) || absMinor(t.baseAmountMinor);
        if (amount > 0n) {
          commitments.push({
            date: t.postedDate,
            name: t.merchantName ?? t.description,
            amountMinor: amount,
            origin: 'entered',
            kind: t.type === 'investment' ? 'saving' : 'bill',
            categoryId: t.categoryId,
            transactionId: t.id,
          });
        }
      }
      continue;
    }

    incomeReceived += incomeAmount(t);
    spent += spendingAmount(t);
  }

  // Recurring items due before the period ends that have not already been entered.
  const entered = new Set(commitments.map((c) => `${c.date}|${c.amountMinor}`));
  const horizonEnd = windowEnd < today ? today : windowEnd;

  for (const occ of upcomingOccurrences(series, today, horizonEnd)) {
    if (!isExternalCashMovement(occ)) continue;
    const key = `${occ.date}|${absMinor(occ.amountMinor)}`;
    if (entered.has(key)) continue; // the user already entered this one by hand

    const amount = absMinor(occ.amountMinor);
    if (occ.direction === 'inflow') {
      if (occ.date <= period.end) incomeExpected += amount;
      commitments.push({
        date: occ.date, name: occ.name, amountMinor: amount,
        origin: 'recurring', kind: 'income', categoryId: occ.categoryId, seriesKey: occ.seriesKey,
      });
    } else {
      commitments.push({
        date: occ.date, name: occ.name, amountMinor: amount,
        origin: 'recurring',
        kind: occ.type === 'investment' ? 'saving' : 'bill',
        categoryId: occ.categoryId, seriesKey: occ.seriesKey,
      });
    }
  }

  commitments.sort((a, b) => a.date.localeCompare(b.date));

  // Period maths uses only what falls inside the period; "coming up" uses the wider
  // window so a bill added today always visibly changes something.
  const inPeriod = commitments.filter((c) => c.date >= period.start && c.date <= period.end);
  const soon = commitments.filter((c) => c.date >= today && c.date <= lookaheadEnd);

  const committed = sumMinor(
    inPeriod.filter((c) => c.kind !== 'income').map((c) => c.amountMinor),
  );

  // Safe to spend runs to the next payday, not the end of the calendar month: money
  // arriving on the 28th pays the bills after the 28th. With no payday known, the
  // month is the honest fallback.
  const nextPay = commitments.find((c) => c.kind === 'income' && c.date >= today) ?? null;
  const horizon = nextPay ? nextPay.date : period.end;
  const dueBeforePayday = sumMinor(
    commitments.filter((c) => c.kind !== 'income' && c.date >= today && (nextPay ? c.date < horizon : c.date <= horizon)).map((c) => c.amountMinor),
  );

  // Balances count only transactions that have actually posted.
  const postedTxns = txns.filter((t) => !isScheduled(t, today));
  const balances = allAccountBalances(accounts, postedTxns, today);
  const cash = cashPosition(accounts, balances);

  void categoryById;

  return {
    today,
    period,
    currency,
    incomeReceivedMinor: incomeReceived,
    incomeExpectedMinor: incomeExpected,
    spentMinor: spent,
    committedMinor: committed,
    cashNowMinor: cash.spendableMinor,
    cardsOwedMinor: cash.cardsMinor,
    nextPayday: nextPay?.date ?? null,
    dueBeforePaydayMinor: dueBeforePayday,
    availableNowMinor: cash.spendableMinor - (nextPay ? dueBeforePayday : committed),
    leftThisPeriodMinor: incomeReceived + incomeExpected - spent - committed,
    commitments: inPeriod,
    soonCommitments: soon,
    lookaheadDays,
    hasCommitments: commitments.length > 0,
    daysLeftInPeriod: Math.max(0, diffDays(today, period.end)),
  };
}

/* ------------------------------------------------------------------ */
/* Plain-language labels                                               */
/* ------------------------------------------------------------------ */

/**
 * Every figure the user sees carries a label AND an explanation.
 *
 * "Available Monthly: −$432" told the user nothing — they could not tell whether they
 * had overspent, were behind on a budget, or were about to run out of money. A number
 * on its own is not information.
 */
export interface ExplainedFigure {
  label: string;
  amountMinor: bigint;
  explanation: string;
  tone: 'neutral' | 'positive' | 'attention';
  action?: { label: string; href: string };
}

export function explainAvailable(position: MoneyPosition): ExplainedFigure {
  const { availableNowMinor, cashNowMinor, cardsOwedMinor, nextPayday } = position;
  const due = nextPayday ? position.dueBeforePaydayMinor : position.committedMinor;
  const when = nextPayday ? `before payday on ${shortDate(nextPayday)}` : 'this month';
  // Every part of the sum, in words, so a surprising number can be checked.
  const cash = cardsOwedMinor > 0n
    ? `${fmt(cashNowMinor + cardsOwedMinor)} in your everyday account, minus ${fmt(cardsOwedMinor)} owed on cards`
    : `${fmt(cashNowMinor)} in your everyday account`;

  if (availableNowMinor < 0n) {
    return {
      label: 'Short of your upcoming bills',
      amountMinor: availableNowMinor,
      explanation: `${cash}, minus ${fmt(due)} of bills ${when}. That leaves you ${fmt(-availableNowMinor)} short until more money comes in.`,
      tone: 'attention',
      action: { label: 'See what is coming', href: '/calendar' },
    };
  }

  if (!position.hasCommitments) {
    return {
      label: 'Available to spend',
      amountMinor: availableNowMinor,
      explanation: `${cash}. Once your regular bills are known, this figure accounts for them too.`,
      tone: 'neutral',
      action: { label: 'Add a recurring bill', href: '/recurring' },
    };
  }

  return {
    label: 'Available after upcoming bills',
    amountMinor: availableNowMinor,
    explanation: `${cash}, minus ${fmt(due)} of bills ${when}.`,
    tone: 'positive',
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: IsoDate) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export function explainLeftThisPeriod(position: MoneyPosition): ExplainedFigure {
  const { leftThisPeriodMinor, incomeReceivedMinor, incomeExpectedMinor, spentMinor, committedMinor } = position;
  const totalIncome = incomeReceivedMinor + incomeExpectedMinor;

  if (leftThisPeriodMinor < 0n) {
    return {
      label: 'Projected to overspend',
      amountMinor: leftThisPeriodMinor,
      explanation:
        `Your spending and committed bills this month come to ${fmt(spentMinor + committedMinor)}, ` +
        `which is ${fmt(-leftThisPeriodMinor)} more than the ${fmt(totalIncome)} you expect to earn.`,
      tone: 'attention',
      action: { label: 'Review your budget', href: '/budget' },
    };
  }

  return {
    label: 'Left this month',
    amountMinor: leftThisPeriodMinor,
    explanation:
      `${fmt(totalIncome)} expected income, less ${fmt(spentMinor)} spent and ${fmt(committedMinor)} still to pay.`,
    tone: 'positive',
  };
}

function fmt(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const dollars = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = abs % 100n;
  return `${neg ? '−' : ''}$${dollars}${cents === 0n ? '' : `.${cents.toString().padStart(2, '0')}`}`;
}

/**
 * Ledger semantics — the single source of truth for what counts as what.
 *
 * NOTHING in the application decides for itself whether a transaction is spending.
 * Every page, chart, budget, forecast and export calls into this module. That is the
 * only way the same question gets the same answer everywhere (spec §44).
 *
 * The rules, from docs/03-schema.md §3.1:
 *   expense      → spending
 *   income       → income
 *   transfer     → NEITHER (both legs net to zero; counting one leg invents money)
 *   refund       → NEGATIVE spending, offsetting the original purchase
 *   investment   → neither spending nor income; it is saving
 *   debt_payment → NEITHER (principal is a transfer to a liability account; the
 *                  purchase it repays was already counted as an expense)
 *
 * And for split expenses: only your own part of a purchase is your spending, and
 * someone paying you back for theirs is not income.
 */
import { sumMinor, absMinor } from '@/lib/money';
import type {
  LedgerTxn, LedgerAccount, LedgerCategory, DateRange, IsoDate, TxnType, BusinessClass,
} from './types';
import { withinRange, monthsInRange, monthKey } from './period';

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/** Types that move money between the user's own accounts and so are never spending. */
const INTERNAL_TYPES: ReadonlySet<TxnType> = new Set<TxnType>(['transfer', 'debt_payment']);

export function isInternalTransfer(txn: Pick<LedgerTxn, 'type'>): boolean {
  return INTERNAL_TYPES.has(txn.type);
}

/** Does this transaction affect "how much did I spend?" */
export function countsAsSpending(txn: Pick<LedgerTxn, 'type'>): boolean {
  return txn.type === 'expense' || txn.type === 'refund';
}

export function countsAsIncome(txn: Pick<LedgerTxn, 'type'>): boolean {
  return txn.type === 'income';
}

export function countsAsInvestment(txn: Pick<LedgerTxn, 'type'>): boolean {
  return txn.type === 'investment';
}

/**
 * The positive magnitude a transaction contributes to spending.
 * An expense contributes its absolute amount; a refund contributes a negative amount
 * so that spending nets down (spec §43). Everything else contributes nothing.
 */
export function spendingAmount(txn: Pick<LedgerTxn, 'type' | 'baseAmountMinor' | 'othersShareMinor'>): bigint {
  if (txn.type === 'expense') {
    const total = absMinor(txn.baseAmountMinor);
    const others = txn.othersShareMinor ?? 0n;
    // Never negative: a share larger than the purchase leaves nothing, not a credit.
    return others <= 0n ? total : others >= total ? 0n : total - others;
  }
  if (txn.type === 'refund') return -absMinor(txn.baseAmountMinor);
  return 0n;
}

export function incomeAmount(txn: Pick<LedgerTxn, 'type' | 'baseAmountMinor' | 'repaidInMinor'>): bigint {
  if (txn.type !== 'income') return 0n;
  const total = absMinor(txn.baseAmountMinor);
  const payback = txn.repaidInMinor ?? 0n;
  return payback <= 0n ? total : payback >= total ? 0n : total - payback;
}

export function investmentAmount(txn: Pick<LedgerTxn, 'type' | 'baseAmountMinor'>): bigint {
  return txn.type === 'investment' ? absMinor(txn.baseAmountMinor) : 0n;
}

/**
 * The signed effect on the account's balance, in the account's own direction.
 *
 * For a `debit` account (asset) a positive stored amount increases the balance.
 * For a `credit` account (liability) a positive stored amount increases what is owed.
 * Callers that want "how much cash do I have" use `accountBalance`, which already
 * applies the sign convention.
 */
export function balanceEffect(txn: Pick<LedgerTxn, 'amountMinor'>): bigint {
  return txn.amountMinor;
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

export interface PeriodTotals {
  income: bigint;
  /** Net of refunds. */
  expenses: bigint;
  investments: bigint;
  /** income − expenses. Investments are excluded: money invested is still yours. */
  netCashFlow: bigint;
  /** income − expenses − investments. What actually stayed liquid. */
  liquidChange: bigint;
  /** netCashFlow, expressed as a share of income in basis points. */
  savingsRateBps: number;
  transactionCount: number;
  transferCount: number;
}

export function periodTotals(txns: readonly LedgerTxn[]): PeriodTotals {
  let income = 0n;
  let expenses = 0n;
  let investments = 0n;
  let transferCount = 0;
  let counted = 0;

  for (const t of txns) {
    if (isInternalTransfer(t)) {
      transferCount++;
      continue;
    }
    income += incomeAmount(t);
    expenses += spendingAmount(t);
    investments += investmentAmount(t);
    counted++;
  }

  const netCashFlow = income - expenses;
  const savingsRateBps = income > 0n ? Number((netCashFlow * 10_000n) / income) : 0;

  return {
    income,
    expenses,
    investments,
    netCashFlow,
    liquidChange: netCashFlow - investments,
    savingsRateBps,
    transactionCount: counted,
    transferCount,
  };
}

export function filterByRange(txns: readonly LedgerTxn[], range: DateRange): LedgerTxn[] {
  return txns.filter((t) => withinRange(t.postedDate, range));
}

/* ------------------------------------------------------------------ */
/* Category rollups                                                    */
/* ------------------------------------------------------------------ */

export interface CategoryTotal {
  categoryId: string | null;
  amountMinor: bigint;
  transactionCount: number;
  transactionIds: string[];
}

/**
 * Spending per LEAF category. Splits are honoured: a transaction split across two
 * categories contributes to both, and only its own share to each.
 */
export function spendingByCategory(txns: readonly LedgerTxn[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();

  const add = (categoryId: string | null, amount: bigint, txnId: string) => {
    if (amount === 0n) return;
    const key = categoryId ?? '__uncategorized__';
    const existing = map.get(key);
    if (existing) {
      existing.amountMinor += amount;
      if (!existing.transactionIds.includes(txnId)) {
        existing.transactionIds.push(txnId);
        existing.transactionCount++;
      }
    } else {
      map.set(key, { categoryId, amountMinor: amount, transactionCount: 1, transactionIds: [txnId] });
    }
  };

  for (const t of txns) {
    if (!countsAsSpending(t)) continue;
    const total = spendingAmount(t);
    if (total === 0n) continue;

    if (t.splits && t.splits.length > 0) {
      // Splits carry the raw signed amounts; scale them into spending magnitude.
      const splitSum = sumMinor(t.splits.map((s) => absMinor(s.amountMinor)));
      if (splitSum === 0n) {
        add(t.categoryId, total, t.id);
        continue;
      }
      for (const s of t.splits) {
        const share = (total * absMinor(s.amountMinor)) / splitSum;
        add(s.categoryId, share, t.id);
      }
    } else {
      add(t.categoryId, total, t.id);
    }
  }

  return [...map.values()].sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : -1));
}

/**
 * Rolls leaf totals up a category tree. A parent's total is the sum of its own direct
 * transactions plus all descendants — and because transactions may only attach to
 * leaves (enforced by a database trigger), nothing is double counted.
 */
export function rollUpCategories(
  leafTotals: readonly CategoryTotal[],
  categories: readonly LedgerCategory[],
): Map<string, bigint> {
  const parentOf = new Map<string, string | null>();
  for (const c of categories) parentOf.set(c.id, c.parentId);

  const totals = new Map<string, bigint>();
  for (const leaf of leafTotals) {
    if (!leaf.categoryId) continue;
    let cursor: string | null = leaf.categoryId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      totals.set(cursor, (totals.get(cursor) ?? 0n) + leaf.amountMinor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  return totals;
}

/* ------------------------------------------------------------------ */
/* Merchant rollups                                                    */
/* ------------------------------------------------------------------ */

export interface MerchantTotal {
  merchantName: string;
  amountMinor: bigint;
  transactionCount: number;
  averageMinor: bigint;
  lastDate: IsoDate;
}

export function spendingByMerchant(txns: readonly LedgerTxn[]): MerchantTotal[] {
  const map = new Map<string, { amount: bigint; count: number; last: IsoDate }>();
  for (const t of txns) {
    if (!countsAsSpending(t)) continue;
    const amount = spendingAmount(t);
    if (amount === 0n) continue;
    const name = t.merchantName?.trim() || t.description.trim() || 'Unknown';
    const prev = map.get(name);
    if (prev) {
      prev.amount += amount;
      prev.count++;
      if (t.postedDate > prev.last) prev.last = t.postedDate;
    } else {
      map.set(name, { amount, count: 1, last: t.postedDate });
    }
  }
  return [...map.entries()]
    .map(([merchantName, v]) => ({
      merchantName,
      amountMinor: v.amount,
      transactionCount: v.count,
      averageMinor: v.count > 0 ? v.amount / BigInt(v.count) : 0n,
      lastDate: v.last,
    }))
    .sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Time series                                                         */
/* ------------------------------------------------------------------ */

export interface MonthlySeriesPoint {
  month: string;
  range: DateRange;
  income: bigint;
  expenses: bigint;
  net: bigint;
  investments: bigint;
  savingsRateBps: number;
}

export function monthlySeries(txns: readonly LedgerTxn[], range: DateRange): MonthlySeriesPoint[] {
  const buckets = new Map<string, LedgerTxn[]>();
  for (const m of monthsInRange(range)) buckets.set(monthKey(m.start), []);
  for (const t of txns) {
    const key = monthKey(t.postedDate);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(t);
  }
  return monthsInRange(range).map((m) => {
    const key = monthKey(m.start);
    const totals = periodTotals(buckets.get(key) ?? []);
    return {
      month: key,
      range: m,
      income: totals.income,
      expenses: totals.expenses,
      net: totals.netCashFlow,
      investments: totals.investments,
      savingsRateBps: totals.savingsRateBps,
    };
  });
}

/** Daily spending, used for the burn-down chart and the projection line. */
export function dailySpending(txns: readonly LedgerTxn[], range: DateRange): Map<IsoDate, bigint> {
  const map = new Map<IsoDate, bigint>();
  for (const t of txns) {
    if (!withinRange(t.postedDate, range)) continue;
    const amount = spendingAmount(t);
    if (amount === 0n) continue;
    map.set(t.postedDate, (map.get(t.postedDate) ?? 0n) + amount);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

export interface AccountBalance {
  accountId: string;
  /** In the account's own direction: positive means "owned" for assets, "owed" for debts. */
  rawMinor: bigint;
  /** Signed for net worth: assets positive, liabilities negative. */
  netWorthMinor: bigint;
  normalBalance: 'debit' | 'credit';
  availableCreditMinor: bigint | null;
}

/**
 * Balance as of a date, from the opening balance plus every transaction up to it.
 *
 * A credit-card purchase increases what is owed; the payment that clears it is a
 * transfer which reduces the card balance and the chequing balance by the same
 * amount. The purchase was already counted as spending at the time; the payment is
 * not counted again. That is the whole of spec §27.
 */
export function accountBalance(
  account: LedgerAccount,
  txns: readonly LedgerTxn[],
  asOf?: IsoDate,
): AccountBalance {
  let total = account.openingBalanceMinor;
  for (const t of txns) {
    if (t.accountId !== account.id) continue;
    if (asOf && t.postedDate > asOf) continue;
    if (account.openingBalanceDate && t.postedDate < account.openingBalanceDate) continue;
    total += balanceEffect(t);
  }

  const netWorthMinor = account.normalBalance === 'credit' ? -total : total;
  const availableCreditMinor =
    account.normalBalance === 'credit' && account.creditLimitMinor !== null
      ? account.creditLimitMinor - total
      : null;

  return {
    accountId: account.id,
    rawMinor: total,
    netWorthMinor,
    normalBalance: account.normalBalance,
    availableCreditMinor,
  };
}

export function allAccountBalances(
  accounts: readonly LedgerAccount[],
  txns: readonly LedgerTxn[],
  asOf?: IsoDate,
): AccountBalance[] {
  const byAccount = new Map<string, LedgerTxn[]>();
  for (const t of txns) {
    const list = byAccount.get(t.accountId);
    if (list) list.push(t);
    else byAccount.set(t.accountId, [t]);
  }
  return accounts.map((a) => accountBalance(a, byAccount.get(a.id) ?? [], asOf));
}

export interface CashPosition {
  /** Money you can spend today: asset accounts only. */
  cashMinor: bigint;
  /** What you owe on cards and loans. */
  debtMinor: bigint;
  /** cash − debt across tracked accounts. */
  netMinor: bigint;
}

const LIQUID_TYPES = new Set(['chequing', 'savings', 'cash', 'business_chequing']);

export function cashPosition(
  accounts: readonly LedgerAccount[],
  balances: readonly AccountBalance[],
): CashPosition {
  const byId = new Map(balances.map((b) => [b.accountId, b]));
  let cash = 0n;
  let debt = 0n;
  for (const a of accounts) {
    if (a.excludeFromNetWorth || !a.isActive) continue;
    const b = byId.get(a.id);
    if (!b) continue;
    if (a.normalBalance === 'credit') debt += b.rawMinor;
    else if (LIQUID_TYPES.has(a.type)) cash += b.rawMinor;
  }
  return { cashMinor: cash, debtMinor: debt, netMinor: cash - debt };
}

/* ------------------------------------------------------------------ */
/* Business / personal                                                 */
/* ------------------------------------------------------------------ */

/** The portion of a transaction attributable to a given classification. */
export function classifiedAmount(txn: LedgerTxn, want: Exclude<BusinessClass, 'split'>): bigint {
  const total = spendingAmount(txn) || incomeAmount(txn);
  if (total === 0n) return 0n;

  if (txn.businessClassification !== 'split') {
    return txn.businessClassification === want ? total : 0n;
  }
  if (!txn.splits || txn.splits.length === 0) return 0n;

  const matching = txn.splits.filter((s) => s.businessClassification === want);
  const splitSum = sumMinor(txn.splits.map((s) => absMinor(s.amountMinor)));
  if (splitSum === 0n) return 0n;
  const matchingSum = sumMinor(matching.map((s) => absMinor(s.amountMinor)));
  return (total * matchingSum) / splitSum;
}

export function splitByClassification(txns: readonly LedgerTxn[]): {
  personal: PeriodTotals;
  business: PeriodTotals;
} {
  const personal: LedgerTxn[] = [];
  const business: LedgerTxn[] = [];

  for (const t of txns) {
    if (t.businessClassification === 'personal') personal.push(t);
    else if (t.businessClassification === 'business') business.push(t);
    else if (t.splits && t.splits.length > 0) {
      // Materialise each side as its own pseudo-transaction so the totals are exact.
      const splitSum = sumMinor(t.splits.map((s) => absMinor(s.amountMinor)));
      if (splitSum === 0n) continue;
      for (const side of ['personal', 'business'] as const) {
        const share = sumMinor(
          t.splits.filter((s) => s.businessClassification === side).map((s) => absMinor(s.amountMinor)),
        );
        if (share === 0n) continue;
        const scaled = (t.baseAmountMinor * share) / splitSum;
        const pseudo: LedgerTxn = { ...t, baseAmountMinor: scaled, splits: undefined };
        (side === 'personal' ? personal : business).push(pseudo);
      }
    }
  }

  return { personal: periodTotals(personal), business: periodTotals(business) };
}

/**
 * Plain data types for the finance engine.
 *
 * These are deliberately NOT the Drizzle row types. The engine takes plain data and
 * returns plain data so that it is trivially testable and can never accidentally
 * issue a query. Repositories map database rows into these shapes.
 */
import type { CurrencyCode } from '@/lib/money';

export type TxnType = 'expense' | 'income' | 'transfer' | 'refund' | 'investment' | 'debt_payment';
export type BusinessClass = 'personal' | 'business' | 'split';
export type NormalBalance = 'debit' | 'credit';
export type Necessity = 'essential' | 'discretionary';
export type Classification = 'fixed' | 'variable';

/** An ISO calendar date, `YYYY-MM-DD`. Never a timestamp: a purchase has a day. */
export type IsoDate = string;

export interface LedgerTxn {
  id: string;
  accountId: string;
  postedDate: IsoDate;
  description: string;
  merchantName: string | null;
  merchantId: string | null;
  /** Signed, in the account's own direction. */
  amountMinor: bigint;
  /** The same value in the workspace base currency. This is what the engine totals. */
  baseAmountMinor: bigint;
  currency: CurrencyCode;
  type: TxnType;
  categoryId: string | null;
  businessClassification: BusinessClass;
  isRecurring: boolean;
  recurringSeriesId: string | null;
  transferGroupId: string | null;
  offsetsTransactionId: string | null;
  tags?: string[];
  splits?: LedgerSplit[];
}

export interface LedgerSplit {
  categoryId: string | null;
  businessClassification: BusinessClass;
  amountMinor: bigint;
}

export interface LedgerAccount {
  id: string;
  name: string;
  type: string;
  normalBalance: NormalBalance;
  currency: CurrencyCode;
  openingBalanceMinor: bigint;
  openingBalanceDate: IsoDate | null;
  creditLimitMinor: bigint | null;
  isActive: boolean;
  excludeFromNetWorth: boolean;
}

export interface LedgerCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  kind: 'expense' | 'income' | 'transfer' | 'investment';
  classification: Classification;
  necessity: Necessity;
  color: string | null;
  icon: string | null;
}

export interface DateRange {
  start: IsoDate;
  /** Inclusive. */
  end: IsoDate;
}

/** Every computed figure carries the ids it came from, so the UI can drill through. */
export interface Traced<T> {
  value: T;
  transactionIds: string[];
}

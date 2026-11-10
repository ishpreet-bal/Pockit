/**
 * Turning Plaid's view of money into Pockit's ledger. Pure functions, tested.
 *
 * Plaid's sign convention: a positive amount is money LEAVING the account, for
 * every account type. Pockit stores amounts signed in the account's own
 * direction (docs/03-schema.md §3.1): spending lowers a chequing balance but
 * raises what's owed on a credit card. Getting this backwards flips every number.
 */

export type PockitAccountType = 'chequing' | 'savings' | 'credit_card' | 'line_of_credit' | 'loan' | 'mortgage' | 'investment' | 'other';
export type TxType = 'expense' | 'income' | 'transfer' | 'refund' | 'debt_payment';

export interface PlaidAccount { account_id: string; name: string; official_name?: string | null; mask?: string | null; type: string; subtype?: string | null; balances: { current: number | null; available?: number | null; iso_currency_code?: string | null } }
export interface PlaidTxn {
  transaction_id: string; account_id: string; amount: number; date: string; name: string; merchant_name?: string | null;
  iso_currency_code?: string | null; pending: boolean;
  personal_finance_category?: { primary: string; detailed: string } | null;
}

export function accountType(a: Pick<PlaidAccount, 'type' | 'subtype'>): PockitAccountType {
  const sub = (a.subtype ?? '').toLowerCase();
  switch (a.type) {
    case 'depository': return sub === 'savings' || sub === 'money market' || sub === 'cd' || sub === 'gic' ? 'savings' : 'chequing';
    case 'credit': return sub === 'line of credit' ? 'line_of_credit' : 'credit_card';
    case 'loan': return sub === 'mortgage' ? 'mortgage' : sub === 'line of credit' ? 'line_of_credit' : 'loan';
    case 'investment': case 'brokerage': return 'investment';
    default: return 'other';
  }
}

export const isLiability = (t: PockitAccountType) => t === 'credit_card' || t === 'line_of_credit' || t === 'loan' || t === 'mortgage';

/** Plaid's current balance, in minor units, in the account's own direction (owed is positive on a card). */
export function balanceMinor(a: PlaidAccount): bigint {
  return BigInt(Math.round((a.balances.current ?? 0) * 100));
}

export function txType(t: Pick<PlaidTxn, 'amount' | 'personal_finance_category'>, acct: PockitAccountType): TxType {
  const p = t.personal_finance_category?.primary ?? '';
  const out = t.amount > 0;
  if (p === 'TRANSFER_IN' || p === 'TRANSFER_OUT') return 'transfer';
  if (p === 'LOAN_PAYMENTS') return isLiability(acct) ? 'transfer' : 'debt_payment';
  if (p === 'INCOME' && !out) return 'income';
  if (!out) return isLiability(acct) ? 'refund' : 'income';
  return 'expense';
}

/** Signed in the account's own direction. */
export function signedMinor(t: Pick<PlaidTxn, 'amount'>, acct: PockitAccountType): bigint {
  const minor = BigInt(Math.round(t.amount * 100)); // + = money out
  return isLiability(acct) ? minor : -minor;
}

/**
 * Plaid's detailed category → one of Pockit's built-in category slugs
 * (src/lib/data/default-categories.ts). Detailed first, then the primary as a
 * fallback, so a new Plaid subcategory still lands somewhere sensible.
 */
const DETAILED: Record<string, string> = {
  INCOME_WAGES: 'salary', INCOME_DIVIDENDS: 'other-income', INCOME_INTEREST_EARNED: 'other-income', INCOME_RETIREMENT_PENSION: 'other-income',
  INCOME_TAX_REFUND: 'other-income', INCOME_UNEMPLOYMENT: 'other-income', INCOME_OTHER_INCOME: 'other-income',
  FOOD_AND_DRINK_GROCERIES: 'groceries', FOOD_AND_DRINK_COFFEE: 'coffee', FOOD_AND_DRINK_FAST_FOOD: 'fast-food', FOOD_AND_DRINK_RESTAURANT: 'restaurants',
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: 'groceries', FOOD_AND_DRINK_VENDING_MACHINES: 'fast-food',
  TRANSPORTATION_GAS: 'gas', TRANSPORTATION_PARKING: 'parking', TRANSPORTATION_PUBLIC_TRANSIT: 'public-transit', TRANSPORTATION_TAXIS_AND_RIDE_SHARES: 'public-transit',
  TRANSPORTATION_TOLLS: 'transportation', TRANSPORTATION_BIKES_AND_SCOOTERS: 'public-transit',
  RENT_AND_UTILITIES_RENT: 'rent', RENT_AND_UTILITIES_TELEPHONE: 'phone', RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'internet',
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: 'utilities', RENT_AND_UTILITIES_WATER: 'utilities', RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: 'utilities',
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: 'clothing', GENERAL_MERCHANDISE_ELECTRONICS: 'electronics', GENERAL_MERCHANDISE_SUPERSTORES: 'shopping',
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: 'shopping', GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'gifts-giving', GENERAL_MERCHANDISE_PET_SUPPLIES: 'household',
  GENERAL_MERCHANDISE_DISCOUNT_STORES: 'shopping', GENERAL_MERCHANDISE_DEPARTMENT_STORES: 'shopping',
  HOME_IMPROVEMENT_FURNITURE: 'household', HOME_IMPROVEMENT_HARDWARE: 'home-maintenance', HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: 'home-maintenance',
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: 'pharmacy', PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'fitness',
  ENTERTAINMENT_TV_AND_MOVIES: 'subscriptions', ENTERTAINMENT_MUSIC_AND_AUDIO: 'subscriptions', ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: 'events',
  ENTERTAINMENT_VIDEO_GAMES: 'hobbies',
  GENERAL_SERVICES_INSURANCE: 'insurance', GENERAL_SERVICES_EDUCATION: 'education', GENERAL_SERVICES_AUTOMOTIVE: 'car-maintenance',
  GENERAL_SERVICES_CHILDCARE: 'household', GENERAL_SERVICES_POSTAGE_AND_SHIPPING: 'miscellaneous',
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: 'gifts-giving',
};
const PRIMARY: Record<string, string> = {
  INCOME: 'other-income', TRANSFER_IN: 'transfer', TRANSFER_OUT: 'transfer',
  FOOD_AND_DRINK: 'restaurants', TRANSPORTATION: 'transportation', TRAVEL: 'travel', RENT_AND_UTILITIES: 'utilities',
  GENERAL_MERCHANDISE: 'shopping', HOME_IMPROVEMENT: 'home-maintenance', MEDICAL: 'medical', PERSONAL_CARE: 'personal-care',
  ENTERTAINMENT: 'entertainment', GENERAL_SERVICES: 'miscellaneous', GOVERNMENT_AND_NON_PROFIT: 'miscellaneous', LOAN_PAYMENTS: 'debt-payments',
  BANK_FEES: 'miscellaneous',
};
export function categorySlug(t: Pick<PlaidTxn, 'personal_finance_category'>): string | null {
  const c = t.personal_finance_category;
  if (!c) return null;
  return DETAILED[c.detailed] ?? PRIMARY[c.primary] ?? null;
}

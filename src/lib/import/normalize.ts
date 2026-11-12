/**
 * Normalisation: turning what a source printed into what the ledger stores.
 *
 * Deliberately deterministic and separate from extraction. The model (or the
 * heuristic parser) reports what it SAW; this module decides what it MEANS. Keeping
 * those apart is what makes a bad import debuggable — you can see the raw text and
 * the interpretation side by side.
 */
import { parseMoney, absMinor, type DecimalHint, MoneyParseError } from '@/lib/money';
import type { IsoDate, TxnType } from '@/lib/finance/types';
import { normalizeMerchant } from '@/lib/finance/duplicates';
import { lookupMerchant } from '@/lib/data/merchant-lexicon';

export type DateFormatHint = 'dmy' | 'mdy' | 'ymd' | 'unknown';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export interface NormalizedDate {
  date: IsoDate | null;
  /** True when the source was genuinely ambiguous and the hint decided it. */
  ambiguous: boolean;
  confidence: number;
}

/**
 * Parse a printed date into an ISO calendar date.
 *
 * The hard case is `09/10`: September 10 or October 9 depending on locale. When the
 * day is above 12 the order is self-evident; otherwise the hint decides, and the
 * result is flagged ambiguous so the review UI can highlight it.
 */
export function normalizeDate(
  raw: string,
  hint: DateFormatHint = 'unknown',
  referenceDate?: IsoDate,
): NormalizedDate {
  const s = raw.trim().replace(/[,]/g, ' ').replace(/\s+/g, ' ');
  if (!s) return { date: null, ambiguous: false, confidence: 0 };

  // ISO — unambiguous.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    return finish(Number(iso[1]), Number(iso[2]), Number(iso[3]), false, 100);
  }

  // Month name forms: "Sep 10 2026", "10 Sep 2026", "Sep 10".
  const nameFirst = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s+(\d{2,4}))?$/.exec(s);
  if (nameFirst) {
    const month = MONTHS[nameFirst[1]!.slice(0, 4).toLowerCase()] ?? MONTHS[nameFirst[1]!.slice(0, 3).toLowerCase()];
    if (month) {
      const year = nameFirst[3] ? expandYear(Number(nameFirst[3])) : inferYear(month, Number(nameFirst[2]), referenceDate);
      return finish(year, month, Number(nameFirst[2]), false, nameFirst[3] ? 98 : 88);
    }
  }
  const dayFirst = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:\s+(\d{2,4}))?$/.exec(s);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]!.slice(0, 4).toLowerCase()] ?? MONTHS[dayFirst[2]!.slice(0, 3).toLowerCase()];
    if (month) {
      const year = dayFirst[3] ? expandYear(Number(dayFirst[3])) : inferYear(month, Number(dayFirst[1]), referenceDate);
      return finish(year, month, Number(dayFirst[1]), false, dayFirst[3] ? 98 : 88);
    }
  }

  // Numeric forms.
  const numeric = /^(\d{1,4})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/.exec(s);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const c = numeric[3] ? expandYear(Number(numeric[3])) : null;

    // Four-digit leading value is a year.
    if (String(numeric[1]).length === 4) {
      return finish(a, b, c ?? 1, false, 95);
    }

    let day: number;
    let month: number;
    let ambiguous = false;

    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { month = a; day = b; }
    else if (hint === 'dmy') { day = a; month = b; ambiguous = true; }
    else if (hint === 'mdy') { month = a; day = b; ambiguous = true; }
    else if (hint === 'ymd') { month = a; day = b; ambiguous = true; }
    else {
      // No hint and both under 13: default to MDY (the dominant convention in
      // North American statements) but mark it so a human confirms.
      month = a; day = b; ambiguous = true;
    }

    const year = c ?? inferYear(month, day, referenceDate);
    return finish(year, month, day, ambiguous, ambiguous ? 55 : 92);
  }

  // Last resort: let the platform try, but only accept a sane result.
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return finish(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), true, 50);
  }

  return { date: null, ambiguous: false, confidence: 0 };
}

function finish(year: number, month: number, day: number, ambiguous: boolean, confidence: number): NormalizedDate {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { date: null, ambiguous, confidence: 0 };
  }
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { date, ambiguous, confidence };
}

function expandYear(y: number): number {
  if (y >= 1000) return y;
  // Two-digit years: 70-99 are 1900s, everything else 2000s.
  return y >= 70 ? 1900 + y : 2000 + y;
}

/**
 * A statement line reading "Sep 10" with no year is almost always the most recent
 * occurrence of that date, not one in the future.
 */
function inferYear(month: number, day: number, referenceDate?: IsoDate): number {
  const ref = referenceDate ? new Date(`${referenceDate}T00:00:00Z`) : new Date();
  const refYear = ref.getUTCFullYear();
  const candidate = Date.UTC(refYear, month - 1, day);
  // Allow a few days of slack for post-dated entries before rolling back a year.
  return candidate > ref.getTime() + 5 * 86_400_000 ? refYear - 1 : refYear;
}

/* ------------------------------------------------------------------ */
/* Amounts                                                             */
/* ------------------------------------------------------------------ */

export interface NormalizedAmount {
  minor: bigint | null;
  /** Sign as printed, before the transaction type is decided. */
  wasNegative: boolean;
  confidence: number;
  error: string | null;
}

export function normalizeAmount(
  raw: string,
  currency: string,
  decimalHint: DecimalHint = 'dot',
): NormalizedAmount {
  try {
    const parsed = parseMoney(raw, currency, decimalHint);
    if (parsed === null) return { minor: null, wasNegative: false, confidence: 0, error: 'No amount' };
    return { minor: absMinor(parsed), wasNegative: parsed < 0n, confidence: 95, error: null };
  } catch (error) {
    return {
      minor: null, wasNegative: false, confidence: 0,
      error: error instanceof MoneyParseError ? `Could not read "${raw}" as an amount` : 'Invalid amount',
    };
  }
}

/* ------------------------------------------------------------------ */
/* Transaction type                                                    */
/* ------------------------------------------------------------------ */

const TRANSFER_HINTS = /\b(transfer|tfr|e-?transfer|interac e-?transfer|to savings|from savings|internet transfer)\b/i;
const CARD_PAYMENT_HINTS = /\b(payment (received|thank you)|thank you|autopay|pre-?authorized payment|card payment)\b/i;
const REFUND_HINTS = /\b(refund|return|reversal|credit adjustment|chargeback)\b/i;
const INCOME_HINTS = /\b(payroll|salary|direct deposit|deposit|paycheque|paycheck|dividend|interest paid)\b/i;
const INVESTMENT_HINTS = /\b(contribution|tfsa|rrsp|401k|brokerage|invest)\b/i;

export interface TypeDecision {
  type: TxnType;
  confidence: number;
  reason: string;
}

/**
 * Decide the transaction type from direction and description.
 *
 * Getting this right matters more than any other extracted field: a transfer
 * mislabelled as an expense inflates spending permanently, and a card payment
 * mislabelled as an expense double-counts every purchase on the card.
 */
export function inferTransactionType(
  description: string,
  moneyIn: boolean,
  accountNormalBalance: 'debit' | 'credit',
): TypeDecision {
  const text = description.toLowerCase();

  if (CARD_PAYMENT_HINTS.test(text) && accountNormalBalance === 'credit') {
    return { type: 'transfer', confidence: 88, reason: 'Looks like a credit-card payment, which is a transfer rather than spending' };
  }
  if (TRANSFER_HINTS.test(text)) {
    return { type: 'transfer', confidence: 80, reason: 'Description mentions a transfer' };
  }
  if (REFUND_HINTS.test(text)) {
    return { type: 'refund', confidence: 85, reason: 'Description mentions a refund or return' };
  }
  if (INVESTMENT_HINTS.test(text)) {
    return { type: 'investment', confidence: 70, reason: 'Description mentions an investment account' };
  }
  if (moneyIn && INCOME_HINTS.test(text)) {
    return { type: 'income', confidence: 90, reason: 'Money in, and the description looks like income' };
  }
  if (moneyIn) {
    // Money arriving on a credit card is normally a refund; on a chequing account,
    // income. This single distinction removes a lot of manual correction.
    return accountNormalBalance === 'credit'
      ? { type: 'refund', confidence: 65, reason: 'Money credited back to a card' }
      : { type: 'income', confidence: 70, reason: 'Money into an asset account' };
  }
  return { type: 'expense', confidence: 85, reason: 'Money out' };
}

/* ------------------------------------------------------------------ */
/* Merchants                                                           */
/* ------------------------------------------------------------------ */

export interface MerchantDecision {
  displayName: string;
  normalized: string;
  categorySlug: string | null;
  confidence: number;
}

/**
 * Clean a raw bank description into a merchant name and, if recognised, a category.
 * "SHELL #4021 TORONTO ON" becomes "Shell" in Transportation > Gas.
 */
export function resolveMerchant(rawDescription: string, providedMerchant?: string | null): MerchantDecision {
  // A merchant name from the bank feed is usually better than the raw text, but not
  // always: "Os Mo Ws" for Osmow's. A name that's all two-letter scraps is ignored.
  const provided = providedMerchant?.trim() && !looksGarbled(providedMerchant) ? providedMerchant.trim() : null;
  const source = (provided || rawDescription).trim();
  const normalized = normalizeMerchant(source);
  // The known-shops list is checked against both, so a garbled feed name still
  // finds the shop in the bank's own text.
  const lexicon = lookupMerchant(source) ?? (provided ? lookupMerchant(rawDescription) : null);

  if (lexicon) {
    return {
      displayName: lexicon.display ?? provided ?? tidyName(rawDescription) ?? source,
      normalized: normalizeMerchant(lexicon.display ?? normalized),
      categorySlug: lexicon.slug,
      confidence: lexicon.confidence,
    };
  }

  return {
    displayName: provided || tidyName(rawDescription) || titleCase(normalized) || source,
    normalized,
    categorySlug: null,
    confidence: provided ? 70 : 45,
  };
}

/** "Os Mo Ws", "Ti Mh Or": three or more pieces, none longer than two letters. */
export function looksGarbled(name: string): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length >= 3 && words.every((w) => w.replace(/[^a-z]/gi, '').length <= 2);
}

/**
 * A readable name from raw bank text: "OSMOW'S #4471 MISSISSAUGA ON" becomes
 * "Osmow's". Store numbers, card wording and the trailing city/province go;
 * apostrophes stay.
 */
export function tidyName(raw: string): string | null {
  // Bank text pads the city after a run of spaces: cut there first, before removing
  // words leaves gaps of its own.
  let s = raw.replace(/\s{2,}.*$/, '');
  s = s.replace(/\b(visa|mc|mastercard)\s+debit\b/gi, ' ').replace(/\b(pos|purchase|pre-?auth|recurring|interac)\b/gi, ' ');
  s = s.replace(/#\s*\d+.*$/, ' ').replace(/\b\d{3,}\b.*$/, ' ');
  s = s.replace(/[*_]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(on|qc|bc|ab|mb|sk|ns|nb|nl|pe)$/i, '').trim();
  if (!s) return null;
  const word = (w: string) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('-'));
  return s.split(' ').map(word).join(' ');
}
const ACRONYMS = new Set(['TD', 'RBC', 'BMO', 'CIBC', 'HSBC', 'ATM', 'CRA', 'LCBO', 'SAQ', 'TTC', 'GO', 'UP', 'IGA', 'KFC', 'A&W', 'H&M', 'CN', 'CP', 'PC', 'BP', 'NSF', 'USD', 'CAD', 'TFSA', 'RRSP', 'RESP', 'EFT', 'ICBC', 'MBNA', 'AMEX']);

function titleCase(s: string): string {
  if (!s) return '';
  return s.split(' ').filter(Boolean)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Detect the decimal convention a file uses, so amounts parse consistently. */
export function detectDecimalHint(samples: readonly string[]): DecimalHint {
  let commaDecimal = 0;
  let dotDecimal = 0;
  for (const s of samples) {
    if (/,\d{2}\b(?!\d)/.test(s) && !/\.\d{2}\b/.test(s)) commaDecimal++;
    if (/\.\d{2}\b(?!\d)/.test(s)) dotDecimal++;
  }
  if (commaDecimal > dotDecimal * 2) return 'comma';
  if (dotDecimal > 0) return 'dot';
  // Nothing conclusive: 'auto' treats a lone three-digit group as thousands, which
  // is the safer reading for statements of unknown origin.
  return 'auto';
}

/** Does a merchant rule's pattern match this (lower-cased) description? Shared by imports and bank sync. */
export function matchesRule(haystack: string, pattern: string, matchType: string): boolean {
  switch (matchType) {
    case 'exact': return haystack.trim() === pattern;
    case 'starts_with': return haystack.startsWith(pattern);
    case 'regex':
      try { return new RegExp(pattern, 'i').test(haystack); } catch { return false; }
    default: return haystack.includes(pattern);
  }
}

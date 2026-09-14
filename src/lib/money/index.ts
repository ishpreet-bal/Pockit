/**
 * Money — integer minor units.
 *
 * Every monetary value in Pockit is a `bigint` count of the currency's minor unit
 * (cents for CAD/USD, yen for JPY). Floating point is never used for money: it cannot
 * represent 0.1 exactly, and the error compounds across a ledger.
 *
 * This module has no I/O and no imports. It is the base of `lib/finance`.
 */

export type CurrencyCode = string;

export interface CurrencyInfo {
  code: CurrencyCode;
  /** Number of decimal places. 2 for CAD/USD/EUR, 0 for JPY, 3 for KWD. */
  exponent: number;
  symbol: string;
  name: string;
}

const CURRENCIES: Record<string, CurrencyInfo> = {
  CAD: { code: 'CAD', exponent: 2, symbol: '$', name: 'Canadian Dollar' },
  USD: { code: 'USD', exponent: 2, symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', exponent: 2, symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', exponent: 2, symbol: '£', name: 'British Pound' },
  AUD: { code: 'AUD', exponent: 2, symbol: '$', name: 'Australian Dollar' },
  NZD: { code: 'NZD', exponent: 2, symbol: '$', name: 'New Zealand Dollar' },
  CHF: { code: 'CHF', exponent: 2, symbol: 'Fr', name: 'Swiss Franc' },
  MXN: { code: 'MXN', exponent: 2, symbol: '$', name: 'Mexican Peso' },
  INR: { code: 'INR', exponent: 2, symbol: '₹', name: 'Indian Rupee' },
  JPY: { code: 'JPY', exponent: 0, symbol: '¥', name: 'Japanese Yen' },
  KRW: { code: 'KRW', exponent: 0, symbol: '₩', name: 'South Korean Won' },
};

export const SUPPORTED_CURRENCIES = Object.values(CURRENCIES);

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return CURRENCIES[code.toUpperCase()] ?? { code: code.toUpperCase(), exponent: 2, symbol: '', name: code };
}

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code.toUpperCase());
}

function pow10(n: number): bigint {
  let r = 1n;
  for (let i = 0; i < n; i++) r *= 10n;
  return r;
}

/** Minor units per major unit, e.g. 100n for CAD. */
export function minorPerMajor(code: CurrencyCode): bigint {
  return pow10(currencyInfo(code).exponent);
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Which character is the decimal separator when a single separator is ambiguous.
 *  - 'dot'   : en-CA/en-US reading. "1.005" is 1.005, "1,005" is one thousand and five.
 *  - 'comma' : European reading. The mirror of the above.
 *  - 'auto'  : a lone separator with exactly three trailing digits is treated as a
 *              thousands separator. Use this for imported statements of unknown origin,
 *              where three decimal places effectively never occur.
 */
export type DecimalHint = 'dot' | 'comma' | 'auto';

export class MoneyParseError extends Error {
  constructor(input: string) {
    super(`Cannot parse "${input}" as a monetary amount`);
    this.name = 'MoneyParseError';
  }
}

/**
 * Parse human input into minor units. Accepts the forms people actually type or
 * that appear in statements and OCR output:
 *   "1234.56"  "1,234.56"  "$1,234.56"  "-$12.00"  "(45.00)"  "1 234,56"  "CAD 12.50"  "12.50 CR"
 *
 * Returns null for empty input; throws MoneyParseError for input that is present
 * but not a number. It never silently returns 0 for garbage — a silent zero in a
 * ledger is worse than a failed import.
 */
export function parseMoney(
  input: string | number | bigint,
  currency: CurrencyCode = 'CAD',
  decimalHint: DecimalHint = 'dot',
): bigint | null {
  if (typeof input === 'bigint') return input;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyParseError(String(input));
    return fromMajorNumber(input, currency);
  }

  let s = input.trim();
  if (s === '') return null;

  let negative = false;

  // Accounting parentheses: (45.00) === -45.00
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // Credit/debit markers used by statement exports.
  const marker = /(^|\s)(CR|DR|CREDIT|DEBIT)\s*$/i.exec(s);
  if (marker) {
    if (/^(DR|DEBIT)$/i.test(marker[2]!)) negative = !negative;
    s = s.slice(0, marker.index).trim();
  }

  // Strip ISO codes and any symbol, keeping only digits, separators and signs.
  s = s.replace(/\b[A-Z]{3}\b/gi, ' ');
  s = s.replace(/[^\d.,\-+\s]/g, '');
  s = s.trim();

  // Leading or trailing sign (some exports put the minus at the end).
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { negative = !negative; s = s.slice(0, -1); }
  s = s.replace(/\s+/g, '').trim();

  if (s === '' || !/^[\d.,]+$/.test(s)) throw new MoneyParseError(input);

  // Decide which separator (if any) is the decimal point.
  //   "1,234.56" / "1.234,56" -> the LAST separator is decimal
  //   "1,234" / "1.234"       -> a lone separator with exactly 3 trailing digits is
  //                              a thousands separator; 3 decimal places do not occur
  //                              in the currencies this app supports
  //   "1.234.567"             -> repeated separator is always thousands
  const seps = s.match(/[.,]/g) ?? [];
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));

  let intPart: string;
  let fracPart: string;

  if (lastSep === -1) {
    intPart = s;
    fracPart = '';
  } else {
    const sepChar = s[lastSep]!;
    const tail = s.slice(lastSep + 1);
    const distinct = new Set(seps).size;

    let isDecimal: boolean;
    if (distinct > 1) {
      // Both separators present: the rightmost one is always the decimal point.
      isDecimal = true;
    } else if (seps.length > 1) {
      // The same separator repeated is always a thousands separator.
      isDecimal = false;
    } else if (tail.length !== 3) {
      // A lone separator with anything other than three trailing digits is decimal.
      isDecimal = true;
    } else if (decimalHint === 'auto') {
      isDecimal = false;
    } else {
      isDecimal = decimalHint === 'dot' ? sepChar === '.' : sepChar === ',';
    }

    if (isDecimal) {
      intPart = s.slice(0, lastSep).replace(/[.,]/g, '');
      fracPart = tail;
    } else {
      intPart = s.replace(/[.,]/g, '');
      fracPart = '';
    }
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) throw new MoneyParseError(input);
  if (intPart === '' && fracPart === '') throw new MoneyParseError(input);

  const exp = currencyInfo(currency).exponent;
  let minorFrac: bigint;
  if (fracPart.length <= exp) {
    minorFrac = BigInt(fracPart.padEnd(exp, '0') || '0');
  } else {
    // More precision supplied than the currency has: round half-up.
    const keep = fracPart.slice(0, exp);
    const nextDigit = Number(fracPart[exp]);
    minorFrac = BigInt(keep || '0') + (nextDigit >= 5 ? 1n : 0n);
  }

  const total = BigInt(intPart || '0') * pow10(exp) + minorFrac;
  return negative ? -total : total;
}


/** Convert a JS number of major units to minor units, rounding half away from zero. */
export function fromMajorNumber(value: number, currency: CurrencyCode = 'CAD'): bigint {
  if (!Number.isFinite(value)) throw new MoneyParseError(String(value));
  const exp = currencyInfo(currency).exponent;
  const scaled = value * Number(pow10(exp));
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return BigInt(rounded);
}

/** Minor units → a JS number of major units. Display and charting only, never storage. */
export function toMajorNumber(minor: bigint, currency: CurrencyCode = 'CAD'): number {
  const exp = currencyInfo(currency).exponent;
  return Number(minor) / Number(pow10(exp));
}

/** Minor units → an exact decimal string, e.g. -1234.50. Safe for export. */
export function toDecimalString(minor: bigint, currency: CurrencyCode = 'CAD'): string {
  const exp = currencyInfo(currency).exponent;
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  if (exp === 0) return (neg ? '-' : '') + abs.toString();
  const div = pow10(exp);
  const whole = abs / div;
  const frac = abs % div;
  return `${neg ? '-' : ''}${whole}.${frac.toString().padStart(exp, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export interface FormatOptions {
  /** Hide the cents when the value is a whole unit, or always. */
  cents?: 'auto' | 'always' | 'never';
  /** Prefix positive values with "+". Used for deltas. */
  signed?: boolean;
  /** Render 12,400 as 12.4K and 1,240,000 as 1.24M. */
  compact?: boolean;
  /** Include the currency code, e.g. "CA$12.00" vs "$12.00". */
  showCode?: boolean;
  locale?: string;
}

export function formatMoney(
  minor: bigint,
  currency: CurrencyCode = 'CAD',
  options: FormatOptions = {},
): string {
  const { cents = 'auto', signed = false, compact = false, showCode = false, locale = 'en-CA' } = options;
  const info = currencyInfo(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;

  let digits: number;
  if (info.exponent === 0) digits = 0;
  else if (cents === 'never') digits = 0;
  else if (cents === 'always') digits = info.exponent;
  else digits = abs % pow10(info.exponent) === 0n ? 0 : info.exponent;

  const value = toMajorNumber(abs, currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: info.code,
    currencyDisplay: showCode ? 'code' : 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(compact ? { notation: 'compact' as const, maximumFractionDigits: value >= 1000 ? 1 : digits } : {}),
  });

  let out: string;
  try {
    out = formatter.format(value);
  } catch {
    out = `${info.symbol}${value.toFixed(digits)}`;
  }

  if (negative) return `-${out}`;
  if (signed && minor > 0n) return `+${out}`;
  return out;
}

/** Splits a formatted amount so the UI can de-emphasise the symbol and the cents. */
export function formatMoneyParts(
  minor: bigint,
  currency: CurrencyCode = 'CAD',
  options: FormatOptions = {},
): { sign: string; symbol: string; whole: string; fraction: string } {
  const formatted = formatMoney(minor, currency, { ...options, cents: options.cents ?? 'always' });
  const sign = formatted.startsWith('-') ? '-' : formatted.startsWith('+') ? '+' : '';
  const body = sign ? formatted.slice(1) : formatted;
  const firstDigit = body.search(/\d/);
  const symbol = firstDigit > 0 ? body.slice(0, firstDigit) : '';
  const numeric = firstDigit >= 0 ? body.slice(firstDigit) : body;
  const sepIdx = Math.max(numeric.lastIndexOf('.'), numeric.lastIndexOf(','));
  const exp = currencyInfo(currency).exponent;
  if (exp === 0 || sepIdx === -1 || numeric.length - sepIdx - 1 !== exp) {
    return { sign, symbol, whole: numeric, fraction: '' };
  }
  return { sign, symbol, whole: numeric.slice(0, sepIdx), fraction: numeric.slice(sepIdx) };
}

/* ------------------------------------------------------------------ */
/* Arithmetic                                                          */
/* ------------------------------------------------------------------ */

export function sumMinor(values: readonly bigint[]): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

export function absMinor(v: bigint): bigint {
  return v < 0n ? -v : v;
}

export function maxMinor(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function minMinor(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function clampMinor(v: bigint, lo: bigint, hi: bigint): bigint {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Multiply by a rational factor with half-up rounding. Used for percentages and rates. */
export function mulRatio(minor: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('mulRatio: denominator must not be zero');
  const product = minor * numerator;
  const neg = product < 0n !== denominator < 0n;
  const absProduct = product < 0n ? -product : product;
  const absDen = denominator < 0n ? -denominator : denominator;
  const q = absProduct / absDen;
  const r = absProduct % absDen;
  const rounded = r * 2n >= absDen ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/** Apply basis points (1 bp = 0.01%). 2500 bps = 25%. */
export function applyBps(minor: bigint, bps: number | bigint): bigint {
  return mulRatio(minor, BigInt(bps), 10_000n);
}

/** Express `part` as basis points of `whole`. Returns 0 when whole is 0. */
export function toBps(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number(mulRatio(part, 10_000n, whole));
}

/** Percentage of `whole` represented by `part`, as a float for display only. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return (Number(part) / Number(whole)) * 100;
}

/**
 * Split an amount into `n` parts, or by weights, distributing the remainder so the
 * parts always sum EXACTLY back to the original. This is what makes split
 * transactions total correctly (spec §43) — naive rounding loses or invents cents.
 */
export function allocate(minor: bigint, weights: readonly number[]): bigint[] {
  const n = weights.length;
  if (n === 0) return [];

  // Negative or non-finite weights are meaningless for a split; treat them as zero.
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightTotal = safe.reduce((a, b) => a + b, 0);
  const effective = weightTotal === 0 ? new Array<number>(n).fill(1) : safe;
  const effTotal = weightTotal === 0 ? n : weightTotal;

  const neg = minor < 0n;
  const abs = neg ? -minor : minor;

  // Integer weights avoid float drift in the share computation.
  const SCALE = 1_000_000;
  const intWeights = effective.map((w) => BigInt(Math.round((w / effTotal) * SCALE)));
  let weightSum = intWeights.reduce((a, b) => a + b, 0n);
  if (weightSum === 0n) {
    for (let i = 0; i < n; i++) intWeights[i] = 1n;
    weightSum = BigInt(n);
  }

  const parts: bigint[] = [];
  let allocated = 0n;
  for (const w of intWeights) {
    const share = (abs * w) / weightSum; // floor; remainder handled below
    parts.push(share);
    allocated += share;
  }

  // The floor above loses at most (n - 1) minor units. Hand them out largest-weight
  // first so the parts sum EXACTLY to the input — this is what makes a split
  // transaction reconcile to the cent (spec §43).
  let remainder = abs - allocated;
  const order = intWeights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => (b.w > a.w ? 1 : b.w < a.w ? -1 : a.i - b.i));
  let idx = 0;
  while (remainder > 0n && idx < order.length * 2) {
    const target = order[idx % order.length]!.i;
    parts[target] = parts[target]! + 1n;
    remainder -= 1n;
    idx++;
  }
  // Defensive: if anything is left (impossible for well-formed input), put it on the
  // first part rather than silently losing money.
  if (remainder !== 0n) parts[0] = parts[0]! + remainder;

  return neg ? parts.map((p) => -p) : parts;
}

/** Split evenly into n parts, remainder distributed. */
export function allocateEvenly(minor: bigint, n: number): bigint[] {
  return allocate(minor, new Array<number>(n).fill(1));
}

/* ------------------------------------------------------------------ */
/* Foreign exchange                                                    */
/* ------------------------------------------------------------------ */

export interface ConvertedMoney {
  /** The untouched original. Conversion never destroys this (spec §28). */
  originalMinor: bigint;
  originalCurrency: CurrencyCode;
  baseMinor: bigint;
  baseCurrency: CurrencyCode;
  /** The exact rate used, retained for auditability. */
  rate: string;
  rateDate: string | null;
}

/**
 * Convert between currencies, preserving the original amount and the rate used.
 * `rate` is expressed as: 1 unit of `from` = `rate` units of `to`.
 * It is accepted as a string so callers cannot lose precision before we see it.
 */
export function convertMoney(
  minor: bigint,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: string | number,
  rateDate: string | null = null,
): ConvertedMoney {
  const fromExp = currencyInfo(from).exponent;
  const toExp = currencyInfo(to).exponent;
  const rateStr = typeof rate === 'number' ? rate.toFixed(10) : rate.trim();

  if (from.toUpperCase() === to.toUpperCase()) {
    return {
      originalMinor: minor,
      originalCurrency: from.toUpperCase(),
      baseMinor: minor,
      baseCurrency: to.toUpperCase(),
      rate: '1',
      rateDate,
    };
  }

  const [whole = '0', frac = ''] = rateStr.split('.');
  const rateScale = BigInt(frac.length);
  const rateInt = BigInt((whole === '' || whole === '-' ? '0' : whole) + frac || '0');
  const rateDen = pow10(Number(rateScale));

  // minorTo = minorFrom / 10^fromExp * rate * 10^toExp
  const numerator = minor * rateInt * pow10(toExp);
  const denominator = rateDen * pow10(fromExp);
  const baseMinor = mulRatio(numerator, 1n, denominator);

  return {
    originalMinor: minor,
    originalCurrency: from.toUpperCase(),
    baseMinor,
    baseCurrency: to.toUpperCase(),
    rate: rateStr,
    rateDate,
  };
}

/* ------------------------------------------------------------------ */
/* Storage boundary                                                    */
/* ------------------------------------------------------------------ */

/** Postgres bigint arrives from the driver as a string. Normalise safely. */
export function minorFromDb(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`Unsafe integer from DB: ${value}`);
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (trimmed === '') return 0n;
  return BigInt(trimmed);
}

/** Serialise for transport to the client, where bigint is not JSON-safe. */
export function minorToJson(v: bigint): string {
  return v.toString();
}

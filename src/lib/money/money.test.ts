import { describe, it, expect } from 'vitest';
import {
  parseMoney, MoneyParseError, fromMajorNumber, toMajorNumber, toDecimalString,
  formatMoney, formatMoneyParts, allocate, allocateEvenly, mulRatio, applyBps,
  toBps, convertMoney, sumMinor, minorFromDb, currencyInfo,
} from './index';

describe('parseMoney', () => {
  it('parses plain decimals', () => {
    expect(parseMoney('1234.56')).toBe(123456n);
    expect(parseMoney('0.01')).toBe(1n);
    expect(parseMoney('0')).toBe(0n);
    expect(parseMoney('100')).toBe(10000n);
  });

  it('parses thousands separators', () => {
    expect(parseMoney('1,234.56')).toBe(123456n);
    expect(parseMoney('1,234,567.89')).toBe(123456789n);
    expect(parseMoney('1,234')).toBe(123400n);
  });

  it('parses European formatting', () => {
    expect(parseMoney('1.234,56')).toBe(123456n);
    expect(parseMoney('1.234.567,89')).toBe(123456789n);
    expect(parseMoney('1 234,56')).toBe(123456n);
  });

  it('parses currency symbols and codes', () => {
    expect(parseMoney('$1,234.56')).toBe(123456n);
    expect(parseMoney('CAD 12.50')).toBe(1250n);
    expect(parseMoney('€99,99')).toBe(9999n);
    expect(parseMoney('12.50 CAD')).toBe(1250n);
  });

  it('handles every negative convention that appears in statements', () => {
    expect(parseMoney('-12.00')).toBe(-1200n);
    expect(parseMoney('(45.00)')).toBe(-4500n);
    expect(parseMoney('-$12.00')).toBe(-1200n);
    expect(parseMoney('12.00-')).toBe(-1200n);
    expect(parseMoney('50.00 DR')).toBe(-5000n);
    expect(parseMoney('50.00 CR')).toBe(5000n);
  });

  it('respects currency exponent', () => {
    expect(parseMoney('1234', 'JPY')).toBe(1234n);
    expect(parseMoney('1,234', 'JPY')).toBe(1234n);
  });

  it('resolves the ambiguous three-digit separator using the hint', () => {
    // A lone separator with exactly three trailing digits is genuinely ambiguous:
    // "1.005" is $1,005 in a German statement and $1.005 typed by a Canadian.
    expect(parseMoney('1.005', 'CAD', 'dot')).toBe(101n);       // 1.005 -> 1.01
    expect(parseMoney('1.005', 'CAD', 'auto')).toBe(100500n);   // 1,005.00
    expect(parseMoney('1,005', 'CAD', 'dot')).toBe(100500n);    // 1,005.00
    expect(parseMoney('1,005', 'CAD', 'comma')).toBe(101n);     // 1,005 -> 1.01
    // Unambiguous cases are unaffected by the hint.
    for (const hint of ['dot', 'comma', 'auto'] as const) {
      expect(parseMoney('1,234.56', 'CAD', hint)).toBe(123456n);
      expect(parseMoney('12.50', 'CAD', hint)).toBe(1250n);
    }
  });

  it('rounds excess precision half-up rather than truncating', () => {
    expect(parseMoney('1.004')).toBe(100n);
    expect(parseMoney('9.999')).toBe(1000n);
  });

  it('returns null for empty input but throws for garbage', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
    expect(() => parseMoney('abc')).toThrow(MoneyParseError);
    expect(() => parseMoney('--')).toThrow(MoneyParseError);
  });

  it('never silently returns zero for unparseable input', () => {
    // A silent zero in a ledger is worse than a failed import.
    for (const bad of ['n/a', 'pending', '--', '???']) {
      expect(() => parseMoney(bad)).toThrow();
    }
  });
});

describe('float safety', () => {
  it('avoids the classic 0.1 + 0.2 problem', () => {
    const a = parseMoney('0.1')!;
    const b = parseMoney('0.2')!;
    expect(a + b).toBe(parseMoney('0.3'));
    expect(toDecimalString(a + b)).toBe('0.30');
  });

  it('sums a thousand cents exactly', () => {
    const cents = Array.from({ length: 1000 }, () => parseMoney('0.01')!);
    expect(sumMinor(cents)).toBe(1000n);
    expect(toDecimalString(sumMinor(cents))).toBe('10.00');
  });

  it('round-trips through major-unit numbers', () => {
    expect(fromMajorNumber(1234.56)).toBe(123456n);
    expect(toMajorNumber(123456n)).toBe(1234.56);
    expect(fromMajorNumber(-0.07)).toBe(-7n);
  });
});

describe('toDecimalString', () => {
  it('formats exactly for export', () => {
    expect(toDecimalString(123456n)).toBe('1234.56');
    expect(toDecimalString(-5n)).toBe('-0.05');
    expect(toDecimalString(0n)).toBe('0.00');
    expect(toDecimalString(1234n, 'JPY')).toBe('1234');
  });
});

describe('formatMoney', () => {
  it('hides cents when whole by default and shows them when asked', () => {
    expect(formatMoney(120000n)).toBe('$1,200');
    expect(formatMoney(120050n)).toBe('$1,200.50');
    expect(formatMoney(120000n, 'CAD', { cents: 'always' })).toBe('$1,200.00');
  });

  it('places the minus outside the symbol', () => {
    expect(formatMoney(-4500n)).toBe('-$45');
  });

  it('supports signed deltas and compact notation', () => {
    expect(formatMoney(4500n, 'CAD', { signed: true })).toBe('+$45');
    expect(formatMoney(1_240_000n, 'CAD', { compact: true })).toMatch(/12\.4K/);
  });

  // Regression: compact notation set maximumFractionDigits below minimumFractionDigits,
  // and Intl throws a RangeError for that. Every compact figure over $1,000 with cents
  // crashed the page — which is any real net-worth number, so the dashboard 500'd as
  // soon as an account had data in it.
  it('never throws for any value and option combination', () => {
    const values = [0n, 1n, 99n, 100n, 999n, 100_000n, 123_456n, 99_999_999n, -123_456n, -1n];
    const currencies = ['CAD', 'USD', 'EUR', 'JPY'];
    for (const minor of values) {
      for (const currency of currencies) {
        for (const compact of [true, false]) {
          for (const cents of ['auto', 'always', 'never'] as const) {
            for (const signed of [true, false]) {
              expect(() => formatMoney(minor, currency, { compact, cents, signed })).not.toThrow();
              expect(() => formatMoneyParts(minor, currency, { compact, cents, signed })).not.toThrow();
            }
          }
        }
      }
    }
  });

  it('formats compact values over a thousand with cents', () => {
    // The exact case that crashed: >= 1000 with a non-zero fractional part.
    expect(formatMoney(128_450n, 'CAD', { compact: true })).toMatch(/1\.3K/);
    expect(formatMoney(1_234_567n, 'CAD', { compact: true })).toMatch(/12\.3K/);
  });

  it('splits into parts for de-emphasised rendering', () => {
    const p = formatMoneyParts(128450n);
    expect(p.symbol).toBe('$');
    expect(p.whole).toBe('1,284');
    expect(p.fraction).toBe('.50');
    expect(p.sign).toBe('');
  });
});

describe('allocate — split transactions must total exactly', () => {
  it('splits evenly with the remainder distributed', () => {
    const parts = allocateEvenly(10000n, 3);
    expect(sumMinor(parts)).toBe(10000n);
    expect(parts).toEqual([3334n, 3333n, 3333n]);
  });

  it('splits by weights and still totals exactly', () => {
    const parts = allocate(10000n, [70, 30]);
    expect(sumMinor(parts)).toBe(10000n);
    expect(parts).toEqual([7000n, 3000n]);
  });

  it('handles pathological weights without losing a cent', () => {
    for (const total of [1n, 7n, 99n, 100n, 10001n, 999999n]) {
      for (const weights of [[1, 1, 1], [1, 2, 3, 4], [33, 33, 34], [1, 0, 0], [99.9, 0.1]]) {
        const parts = allocate(total, weights);
        expect(sumMinor(parts)).toBe(total);
        expect(parts.length).toBe(weights.length);
      }
    }
  });

  it('preserves sign for negative amounts', () => {
    const parts = allocate(-10000n, [50, 50]);
    expect(sumMinor(parts)).toBe(-10000n);
    expect(parts.every((p) => p <= 0n)).toBe(true);
  });

  it('falls back to an even split when all weights are zero', () => {
    const parts = allocate(1000n, [0, 0, 0, 0]);
    expect(sumMinor(parts)).toBe(1000n);
    expect(parts).toEqual([250n, 250n, 250n, 250n]);
  });
});

describe('ratios and basis points', () => {
  it('rounds half-up', () => {
    expect(mulRatio(5n, 1n, 2n)).toBe(3n);
    expect(mulRatio(-5n, 1n, 2n)).toBe(-3n);
    expect(mulRatio(10000n, 1n, 3n)).toBe(3333n);
  });

  it('applies basis points', () => {
    expect(applyBps(10000n, 2500)).toBe(2500n);   // 25%
    expect(applyBps(10000n, 1)).toBe(1n);          // 0.01%
    expect(applyBps(123456n, 1999)).toBe(24679n);
  });

  it('computes bps of a whole and tolerates a zero denominator', () => {
    expect(toBps(2500n, 10000n)).toBe(2500);
    expect(toBps(100n, 0n)).toBe(0);
  });
});

describe('convertMoney — original values are never destroyed', () => {
  it('converts and retains the original and the rate', () => {
    const r = convertMoney(10000n, 'USD', 'CAD', '1.35');
    expect(r.baseMinor).toBe(13500n);
    expect(r.originalMinor).toBe(10000n);
    expect(r.originalCurrency).toBe('USD');
    expect(r.rate).toBe('1.35');
  });

  it('is a no-op for the same currency', () => {
    const r = convertMoney(12345n, 'CAD', 'CAD', '1');
    expect(r.baseMinor).toBe(12345n);
    expect(r.rate).toBe('1');
  });

  it('handles differing exponents', () => {
    // 1000 JPY at 0.0092 CAD/JPY = 9.20 CAD
    const r = convertMoney(1000n, 'JPY', 'CAD', '0.0092');
    expect(r.baseMinor).toBe(920n);
    // and back
    const back = convertMoney(920n, 'CAD', 'JPY', '108.6956');
    expect(back.baseMinor).toBe(1000n);
  });

  it('keeps high-precision rates exact', () => {
    const r = convertMoney(100000n, 'USD', 'CAD', '1.36842105');
    expect(r.baseMinor).toBe(136842n);
  });
});

describe('minorFromDb', () => {
  it('accepts the string form the pg driver returns for bigint', () => {
    expect(minorFromDb('123456')).toBe(123456n);
    expect(minorFromDb('-5')).toBe(-5n);
    expect(minorFromDb(null)).toBe(0n);
    expect(minorFromDb(undefined)).toBe(0n);
    expect(minorFromDb('')).toBe(0n);
    expect(minorFromDb(42)).toBe(42n);
  });
});

describe('currencyInfo', () => {
  it('knows exponents', () => {
    expect(currencyInfo('CAD').exponent).toBe(2);
    expect(currencyInfo('JPY').exponent).toBe(0);
    expect(currencyInfo('unknown').exponent).toBe(2);
  });
});

describe('formatting does not depend on the runtime', () => {
  it('renders a currency symbol from our own table, not from ICU', () => {
    // The bug this pins: with `currencyDisplay: 'narrowSymbol'`, a Node build
    // without full ICU rendered USD as "US$" while the browser rendered "$" — the
    // same price, formatted two ways, on the same page.
    expect(formatMoney(31295n, 'USD')).toBe('$312.95');
    expect(formatMoney(31295n, 'CAD')).toBe('$312.95');
    expect(formatMoney(31295n, 'EUR')).toBe('€312.95');
    expect(formatMoney(31295n, 'GBP')).toBe('£312.95');
  });

  it('still shows the code when asked', () => {
    expect(formatMoney(31295n, 'USD', { showCode: true })).toBe('312.95 USD');
  });

  it('keeps the sign outside the symbol', () => {
    expect(formatMoney(-31295n, 'USD')).toBe('-$312.95');
    expect(formatMoney(31295n, 'USD', { signed: true })).toBe('+$312.95');
  });

  it('splits into parts the same way after the change', () => {
    const parts = formatMoneyParts(31295n, 'USD');
    expect(parts.symbol).toBe('$');
    expect(parts.whole).toBe('312');
    expect(parts.fraction).toBe('.95');
  });
});

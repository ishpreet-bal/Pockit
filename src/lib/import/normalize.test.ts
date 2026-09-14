import { describe, it, expect } from 'vitest';
import { normalizeDate, normalizeAmount, inferTransactionType, resolveMerchant, detectDecimalHint } from './normalize';
import { parseStatementText } from '@/lib/ai/heuristic';

describe('normalizeDate', () => {
  it('accepts ISO dates with full confidence', () => {
    const r = normalizeDate('2026-09-10');
    expect(r.date).toBe('2026-09-10');
    expect(r.ambiguous).toBe(false);
    expect(r.confidence).toBe(100);
  });

  it('reads month-name forms in both orders', () => {
    expect(normalizeDate('Sep 10, 2026').date).toBe('2026-09-10');
    expect(normalizeDate('10 Sep 2026').date).toBe('2026-09-10');
    expect(normalizeDate('September 3 2026').date).toBe('2026-09-03');
  });

  it('resolves numeric dates when the day exceeds 12', () => {
    // 25 cannot be a month, so the order is self-evident regardless of hint.
    const r = normalizeDate('25/09/2026', 'mdy');
    expect(r.date).toBe('2026-09-25');
    expect(r.ambiguous).toBe(false);
  });

  it('flags genuinely ambiguous dates and lets the hint decide', () => {
    const mdy = normalizeDate('09/10/2026', 'mdy');
    expect(mdy.date).toBe('2026-09-10');
    expect(mdy.ambiguous).toBe(true);

    const dmy = normalizeDate('09/10/2026', 'dmy');
    expect(dmy.date).toBe('2026-10-09');
    expect(dmy.ambiguous).toBe(true);

    // Low confidence is what makes the review UI highlight the field.
    expect(mdy.confidence).toBeLessThan(70);
  });

  it('infers a missing year as the most recent occurrence, never the future', () => {
    // Reference is Sep 2026, so "Dec 20" must be the previous December.
    expect(normalizeDate('Dec 20', 'unknown', '2026-09-14').date).toBe('2025-12-20');
    expect(normalizeDate('Aug 20', 'unknown', '2026-09-14').date).toBe('2026-08-20');
  });

  it('expands two-digit years', () => {
    expect(normalizeDate('01/15/99', 'mdy').date).toBe('1999-01-15');
    expect(normalizeDate('01/15/26', 'mdy').date).toBe('2026-01-15');
  });

  it('returns null rather than guessing at unparseable input', () => {
    expect(normalizeDate('').date).toBeNull();
    expect(normalizeDate('not a date').date).toBeNull();
    expect(normalizeDate('99/99/9999').date).toBeNull();
  });
});

describe('normalizeAmount', () => {
  it('returns magnitude plus the printed sign separately', () => {
    expect(normalizeAmount('$72.18', 'CAD')).toMatchObject({ minor: 7218n, wasNegative: false });
    expect(normalizeAmount('-$72.18', 'CAD')).toMatchObject({ minor: 7218n, wasNegative: true });
    expect(normalizeAmount('(72.18)', 'CAD')).toMatchObject({ minor: 7218n, wasNegative: true });
  });

  it('reports an error instead of silently returning zero', () => {
    const r = normalizeAmount('pending', 'CAD');
    expect(r.minor).toBeNull();
    expect(r.error).toBeTruthy();
    expect(r.confidence).toBe(0);
  });
});

describe('inferTransactionType — the decisions that matter most', () => {
  it('treats a credit-card payment as a transfer, not spending', () => {
    const r = inferTransactionType('PAYMENT RECEIVED - THANK YOU', true, 'credit');
    expect(r.type).toBe('transfer');
  });

  it('recognises transfers from the description', () => {
    expect(inferTransactionType('Internet transfer to savings', false, 'debit').type).toBe('transfer');
    expect(inferTransactionType('INTERAC E-TRANSFER', false, 'debit').type).toBe('transfer');
  });

  it('recognises refunds', () => {
    expect(inferTransactionType('AMAZON.CA REFUND', true, 'credit').type).toBe('refund');
    expect(inferTransactionType('Return - Best Buy', true, 'debit').type).toBe('refund');
  });

  it('distinguishes money in on a card from money in on a chequing account', () => {
    // A credit back to a card is a refund; the same on chequing is income.
    expect(inferTransactionType('SOME MERCHANT', true, 'credit').type).toBe('refund');
    expect(inferTransactionType('SOME DEPOSIT', true, 'debit').type).toBe('income');
  });

  it('recognises payroll as income', () => {
    const r = inferTransactionType('PAYROLL DEPOSIT ACME CORP', true, 'debit');
    expect(r.type).toBe('income');
    expect(r.confidence).toBeGreaterThan(85);
  });

  it('defaults money out to an expense', () => {
    expect(inferTransactionType('SHELL #4021', false, 'credit').type).toBe('expense');
  });
});

describe('resolveMerchant', () => {
  it('cleans bank noise and maps to a category', () => {
    const r = resolveMerchant('SHELL #4021 TORONTO ON');
    expect(r.displayName).toBe('Shell');
    expect(r.categorySlug).toBe('gas');
    expect(r.confidence).toBeGreaterThan(70);
  });

  it('prefers the more specific lexicon match', () => {
    // "uber eats" must beat "uber", or takeaway lands in Transportation.
    expect(resolveMerchant('UBER EATS TORONTO').categorySlug).toBe('restaurants');
    expect(resolveMerchant('UBER TRIP').categorySlug).toBe('rideshare');
  });

  it('falls back to a cleaned description with low confidence', () => {
    const r = resolveMerchant('SQ *SOME LOCAL CAFE 8842');
    expect(r.categorySlug).toBeNull();
    expect(r.confidence).toBeLessThan(60);
    expect(r.displayName).not.toContain('8842');
  });
});

describe('detectDecimalHint', () => {
  it('detects European formatting', () => {
    expect(detectDecimalHint(['1.234,56', '99,99', '2.100,00'])).toBe('comma');
  });
  it('detects dot decimals', () => {
    expect(detectDecimalHint(['1,234.56', '99.99'])).toBe('dot');
  });
});

describe('parseStatementText — the no-API-key path', () => {
  it('extracts rows from a typical statement', () => {
    const text = `
Statement of Account
Page 1 of 3
Date        Description                     Amount
Sep 10      SHELL #4021 TORONTO ON          $72.18
Sep 09      MCDONALD'S #1234                $14.50
Sep 08      AMAZON.CA*1A2B3C                $81.27
Closing balance                             $1,240.00
    `.trim();

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ date: 'Sep 10', amount: '$72.18' });
    expect(rows[0]!.description).toContain('SHELL');
    expect(rows[2]!.amount).toBe('$81.27');
  });

  it('skips headers, totals and page furniture', () => {
    const rows = parseStatementText([
      'Previous balance                 $500.00',
      'Page 2 of 3',
      'Minimum payment due              $35.00',
      'Sep 10  REAL TRANSACTION         $12.00',
    ].join('\n'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toContain('REAL TRANSACTION');
  });

  it('takes the transaction amount, not the running balance, when both are printed', () => {
    const rows = parseStatementText('2026-09-10  GROCERY STORE   45.20   1,204.80');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe('45.20');
  });

  it('marks credit-flagged lines as money in', () => {
    const rows = parseStatementText('2026-09-10  REFUND ISSUED   45.20 CR');
    expect(rows[0]!.direction).toBe('credit');
  });
});

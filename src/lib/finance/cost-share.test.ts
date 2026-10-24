import { describe, expect, it } from 'vitest';
import { describeShare, owedMinor, shareAmounts } from './cost-share';
import { incomeAmount, periodTotals, spendingAmount, spendingByCategory } from './ledger';
import type { LedgerTxn } from './types';

describe('shareAmounts', () => {
  it('splits evenly and gives the leftover cents to you', () => {
    // $100.00 three ways: two friends owe $33.33 each, your part is $33.34.
    const a = shareAmounts(10_000n, { kind: 'split', people: 3, expectBack: true });
    expect(a).toEqual({ mineMinor: 3_334n, othersMinor: 6_666n, excludedMinor: 6_666n, eachMinor: 3_333n });
  });

  it('works on the stored (signed) amount as well as a magnitude', () => {
    expect(shareAmounts(-12_000n, { kind: 'split', people: 4, expectBack: true }).mineMinor).toBe(3_000n);
  });

  it('honours an uneven split, clamped to the purchase', () => {
    expect(shareAmounts(10_000n, { kind: 'split', people: 2, mineMinor: 4_000n, expectBack: true }))
      .toMatchObject({ mineMinor: 4_000n, othersMinor: 6_000n });
    expect(shareAmounts(10_000n, { kind: 'split', people: 2, mineMinor: 50_000n, expectBack: true }).othersMinor).toBe(0n);
  });

  it('treats fewer than two people as two', () => {
    expect(shareAmounts(1_000n, { kind: 'split', people: 1, expectBack: true }).mineMinor).toBe(500n);
  });

  it('takes a covered purchase out of your spending only when it is coming back', () => {
    expect(shareAmounts(5_000n, { kind: 'covered', expectBack: true })).toMatchObject({ mineMinor: 0n, excludedMinor: 5_000n });
    expect(shareAmounts(5_000n, { kind: 'covered', expectBack: false })).toMatchObject({ mineMinor: 5_000n, excludedMinor: 0n });
  });

  it('keeps others out of your spending on a split even when nothing is owed any more', () => {
    expect(shareAmounts(9_000n, { kind: 'split', people: 3, expectBack: false }).excludedMinor).toBe(6_000n);
  });
});

describe('owedMinor', () => {
  const split = { kind: 'split' as const, people: 4, expectBack: true };
  it('counts down as money comes back and never goes below zero', () => {
    const a = shareAmounts(12_000n, split);
    expect(owedMinor(a, split, 0n)).toBe(9_000n);
    expect(owedMinor(a, split, 3_000n)).toBe(6_000n);
    expect(owedMinor(a, split, 20_000n)).toBe(0n);
  });
  it('is nothing when you are not expecting it back', () => {
    expect(owedMinor(shareAmounts(12_000n, { ...split, expectBack: false }), { expectBack: false }, 0n)).toBe(0n);
  });
});

describe('describeShare', () => {
  it('reads plainly', () => {
    expect(describeShare({ kind: 'split', people: 4, expectBack: true })).toBe('Split 4 ways');
    expect(describeShare({ kind: 'split', people: 2, expectBack: true }, 'Sam')).toBe('Split with Sam');
    expect(describeShare({ kind: 'covered', expectBack: true }, 'Mom')).toBe('Paid for Mom');
    expect(describeShare({ kind: 'covered', expectBack: false })).toBe('Paid for someone else · my treat');
  });
});

const txn = (over: Partial<LedgerTxn>): LedgerTxn => ({
  id: 't', accountId: 'a', postedDate: '2026-10-10', description: 'Dinner', merchantName: null, merchantId: null,
  amountMinor: -12_000n, baseAmountMinor: -12_000n, currency: 'CAD', type: 'expense', categoryId: 'dining',
  businessClassification: 'personal', isRecurring: false, recurringSeriesId: null, transferGroupId: null, offsetsTransactionId: null,
  ...over,
});

describe('the ledger with split expenses', () => {
  it('counts only your part of a split purchase as spending, in every total', () => {
    const dinner = txn({ othersShareMinor: 9_000n });
    expect(spendingAmount(dinner)).toBe(3_000n);
    expect(spendingByCategory([dinner])[0]).toMatchObject({ categoryId: 'dining', amountMinor: 3_000n });
    expect(periodTotals([dinner]).expenses).toBe(3_000n);
  });

  it('never makes spending negative', () => {
    expect(spendingAmount(txn({ othersShareMinor: 50_000n }))).toBe(0n);
  });

  it('does not count a payback as income', () => {
    const payback = txn({ id: 'p', type: 'income', amountMinor: 3_000n, baseAmountMinor: 3_000n, repaidInMinor: 3_000n });
    const salary = txn({ id: 's', type: 'income', amountMinor: 200_000n, baseAmountMinor: 200_000n });
    expect(incomeAmount(payback)).toBe(0n);
    expect(periodTotals([payback, salary]).income).toBe(200_000n);
  });

  it('takes only the payback part out of a bigger deposit', () => {
    // A $50 e-transfer covering a $30 share and $20 for something else.
    expect(incomeAmount(txn({ type: 'income', amountMinor: 5_000n, baseAmountMinor: 5_000n, repaidInMinor: 3_000n }))).toBe(2_000n);
  });

  it('ignores a share on anything that is not a purchase', () => {
    expect(spendingAmount(txn({ type: 'refund', othersShareMinor: 9_000n }))).toBe(-12_000n);
  });
});

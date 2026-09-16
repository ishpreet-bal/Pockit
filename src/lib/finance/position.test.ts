import { describe, it, expect } from 'vitest';
import { computePosition, isScheduled, explainAvailable, explainLeftThisPeriod } from './position';
import type { LedgerTxn, LedgerAccount } from './types';

const TODAY = '2026-09-15';

let seq = 0;
function txn(p: Partial<LedgerTxn> & { amountMinor: bigint; postedDate: string }): LedgerTxn {
  return {
    id: p.id ?? `p${++seq}`,
    accountId: p.accountId ?? 'chq',
    postedDate: p.postedDate,
    description: p.description ?? 'Test',
    merchantName: p.merchantName ?? p.description ?? 'Test',
    merchantId: null,
    amountMinor: p.amountMinor,
    baseAmountMinor: p.baseAmountMinor ?? p.amountMinor,
    currency: 'CAD',
    type: p.type ?? 'expense',
    categoryId: p.categoryId ?? null,
    businessClassification: 'personal',
    isRecurring: false,
    recurringSeriesId: null,
    transferGroupId: p.transferGroupId ?? null,
    offsetsTransactionId: null,
  };
}

const CHQ: LedgerAccount = {
  id: 'chq', name: 'Chequing', type: 'chequing', normalBalance: 'debit', currency: 'CAD',
  openingBalanceMinor: 0n, openingBalanceDate: '2026-09-01',
  creditLimitMinor: null, isActive: true, excludeFromNetWorth: false,
};

const base = { accounts: [CHQ], categories: [], series: [], today: TODAY, currency: 'CAD' };

describe('scheduled vs posted', () => {
  it('treats a future date as not yet happened', () => {
    expect(isScheduled({ postedDate: '2026-09-28' }, TODAY)).toBe(true);
    expect(isScheduled({ postedDate: '2026-09-15' }, TODAY)).toBe(false);
    expect(isScheduled({ postedDate: '2026-09-01' }, TODAY)).toBe(false);
  });

  /**
   * The original bug: a bill entered for later in the month was counted as already
   * spent, so it disappeared from the balance and inflated the spending total.
   */
  it('does not count a future bill as money already spent', () => {
    const position = computePosition({
      ...base,
      txns: [
        txn({ type: 'income', amountMinor: 500_000n, postedDate: '2026-09-01' }),
        txn({ type: 'expense', amountMinor: -100_000n, postedDate: '2026-09-05' }),
        txn({ type: 'expense', amountMinor: -50_000n, postedDate: '2026-09-28', description: 'Car insurance' }),
      ],
    });

    expect(position.spentMinor).toBe(100_000n);        // only what has actually happened
    expect(position.committedMinor).toBe(50_000n);     // the future bill is a commitment
    expect(position.cashNowMinor).toBe(400_000n);      // balance excludes the future bill
    expect(position.availableNowMinor).toBe(350_000n); // cash minus what is committed
  });

  it('keeps the future bill visible as a commitment the user can find', () => {
    const position = computePosition({
      ...base,
      txns: [txn({ type: 'expense', amountMinor: -50_000n, postedDate: '2026-09-28', description: 'Car insurance' })],
    });
    expect(position.commitments).toHaveLength(1);
    expect(position.commitments[0]).toMatchObject({
      name: 'Car insurance', amountMinor: 50_000n, origin: 'entered', kind: 'bill',
    });
  });

  it('counts future income as expected, not received', () => {
    const position = computePosition({
      ...base,
      txns: [txn({ type: 'income', amountMinor: 250_000n, postedDate: '2026-09-29', description: 'Payday' })],
    });
    expect(position.incomeReceivedMinor).toBe(0n);
    expect(position.incomeExpectedMinor).toBe(250_000n);
    expect(position.cashNowMinor).toBe(0n);
  });
});

describe('the one calculation used everywhere', () => {
  it('reconciles income, spending and commitments', () => {
    const position = computePosition({
      ...base,
      txns: [
        txn({ type: 'income', amountMinor: 520_000n, postedDate: '2026-09-01' }),
        txn({ type: 'expense', amountMinor: -274_000n, postedDate: '2026-09-10' }),
        txn({ type: 'expense', amountMinor: -84_000n, postedDate: '2026-09-25', description: 'Rent' }),
      ],
    });
    // income − spent − committed
    expect(position.leftThisPeriodMinor).toBe(520_000n - 274_000n - 84_000n);
    expect(position.availableNowMinor).toBe(position.cashNowMinor - position.committedMinor);
  });

  it('excludes transfers from every figure', () => {
    const position = computePosition({
      ...base,
      txns: [
        txn({ type: 'income', amountMinor: 500_000n, postedDate: '2026-09-01' }),
        txn({ type: 'transfer', amountMinor: -60_000n, postedDate: '2026-09-05', transferGroupId: 'g' }),
        txn({ type: 'transfer', amountMinor: -60_000n, postedDate: '2026-09-25', transferGroupId: 'h' }),
      ],
    });
    expect(position.spentMinor).toBe(0n);
    expect(position.committedMinor).toBe(0n);
    expect(position.leftThisPeriodMinor).toBe(500_000n);
  });

  it('nets refunds against spending', () => {
    const position = computePosition({
      ...base,
      txns: [
        txn({ type: 'expense', amountMinor: -10_000n, postedDate: '2026-09-02' }),
        txn({ type: 'refund', amountMinor: 3_000n, postedDate: '2026-09-04' }),
      ],
    });
    expect(position.spentMinor).toBe(7_000n);
  });
});

describe('figures explain themselves', () => {
  it('names a shortfall plainly and offers an action', () => {
    const position = computePosition({
      ...base,
      txns: [
        txn({ type: 'income', amountMinor: 20_000n, postedDate: '2026-09-01' }),
        txn({ type: 'expense', amountMinor: -80_000n, postedDate: '2026-09-28', description: 'Rent' }),
      ],
    });
    const figure = explainAvailable(position);
    expect(figure.amountMinor).toBeLessThan(0n);
    expect(figure.tone).toBe('attention');
    expect(figure.label).not.toMatch(/available monthly/i); // the old opaque label
    expect(figure.explanation).toMatch(/short/i);
    expect(figure.action?.href).toBeTruthy();
  });

  it('does not alarm a user who simply has no bills set up yet', () => {
    const position = computePosition({
      ...base,
      txns: [txn({ type: 'income', amountMinor: 500_000n, postedDate: '2026-09-01' })],
    });
    const figure = explainAvailable(position);
    expect(figure.tone).toBe('neutral');
    expect(figure.action?.label).toMatch(/recurring/i);
  });

  it('explains the period figure in terms of its inputs', () => {
    const position = computePosition({
      ...base,
      txns: [
        txn({ type: 'income', amountMinor: 500_000n, postedDate: '2026-09-01' }),
        txn({ type: 'expense', amountMinor: -600_000n, postedDate: '2026-09-02' }),
      ],
    });
    const figure = explainLeftThisPeriod(position);
    expect(figure.label).toMatch(/overspend/i);
    expect(figure.explanation).toMatch(/\$/);
    expect(figure.action?.href).toBe('/budget');
  });
});

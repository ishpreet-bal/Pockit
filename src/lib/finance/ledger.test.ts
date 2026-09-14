import { describe, it, expect } from 'vitest';
import {
  periodTotals, spendingAmount, incomeAmount, isInternalTransfer, countsAsSpending,
  spendingByCategory, rollUpCategories, accountBalance, allAccountBalances,
  cashPosition, splitByClassification, monthlySeries, spendingByMerchant,
} from './ledger';
import type { LedgerTxn, LedgerAccount, LedgerCategory } from './types';

/* ---------- fixtures ---------- */

let seq = 0;
function txn(p: Partial<LedgerTxn> & { amountMinor: bigint }): LedgerTxn {
  const amount = p.amountMinor;
  return {
    id: p.id ?? `t${++seq}`,
    accountId: p.accountId ?? 'acct-chq',
    postedDate: p.postedDate ?? '2026-09-10',
    description: p.description ?? 'Test',
    merchantName: p.merchantName ?? null,
    merchantId: null,
    amountMinor: amount,
    baseAmountMinor: p.baseAmountMinor ?? amount,
    currency: 'CAD',
    type: p.type ?? 'expense',
    categoryId: p.categoryId ?? null,
    businessClassification: p.businessClassification ?? 'personal',
    isRecurring: false,
    recurringSeriesId: null,
    transferGroupId: p.transferGroupId ?? null,
    offsetsTransactionId: p.offsetsTransactionId ?? null,
    splits: p.splits,
  };
}

const chequing: LedgerAccount = {
  id: 'acct-chq', name: 'Chequing', type: 'chequing', normalBalance: 'debit',
  currency: 'CAD', openingBalanceMinor: 500_000n, openingBalanceDate: '2026-09-01',
  creditLimitMinor: null, isActive: true, excludeFromNetWorth: false,
};

const visa: LedgerAccount = {
  id: 'acct-visa', name: 'Visa', type: 'credit_card', normalBalance: 'credit',
  currency: 'CAD', openingBalanceMinor: 0n, openingBalanceDate: '2026-09-01',
  creditLimitMinor: 500_000n, isActive: true, excludeFromNetWorth: false,
};

/* ---------- spec §43: the critical cases ---------- */

describe('transfers must not count as expenses', () => {
  it('excludes both legs of a transfer from income and expenses', () => {
    const txns = [
      txn({ type: 'income', amountMinor: 300_000n, description: 'Salary' }),
      txn({ type: 'expense', amountMinor: -10_000n, description: 'Groceries' }),
      // Chequing -> Savings $1,000. Two legs, one group.
      txn({ type: 'transfer', amountMinor: -100_000n, transferGroupId: 'g1', accountId: 'acct-chq' }),
      txn({ type: 'transfer', amountMinor: 100_000n, transferGroupId: 'g1', accountId: 'acct-sav' }),
    ];
    const t = periodTotals(txns);
    expect(t.income).toBe(300_000n);
    expect(t.expenses).toBe(10_000n);
    expect(t.netCashFlow).toBe(290_000n);
    expect(t.transferCount).toBe(2);
  });

  it('classifies transfer and debt_payment as internal', () => {
    expect(isInternalTransfer({ type: 'transfer' })).toBe(true);
    expect(isInternalTransfer({ type: 'debt_payment' })).toBe(true);
    expect(isInternalTransfer({ type: 'expense' })).toBe(false);
    expect(countsAsSpending({ type: 'transfer' })).toBe(false);
  });
});

describe('credit-card payments must not double-count purchases', () => {
  it('counts the purchase once and the payment never', () => {
    const txns = [
      txn({ type: 'income', amountMinor: 400_000n, accountId: 'acct-chq' }),
      // $200 groceries on the Visa: liability increases.
      txn({ type: 'expense', amountMinor: 20_000n, accountId: 'acct-visa', description: 'Groceries' }),
      // Pay the card $200 from chequing: both balances fall, nothing is spent again.
      txn({ type: 'transfer', amountMinor: -20_000n, accountId: 'acct-chq', transferGroupId: 'pay1' }),
      txn({ type: 'transfer', amountMinor: -20_000n, accountId: 'acct-visa', transferGroupId: 'pay1' }),
    ];

    const totals = periodTotals(txns);
    expect(totals.expenses).toBe(20_000n); // NOT 40,000
    expect(totals.income).toBe(400_000n);

    const balances = allAccountBalances([chequing, visa], txns);
    const chq = balances.find((b) => b.accountId === 'acct-chq')!;
    const card = balances.find((b) => b.accountId === 'acct-visa')!;

    // 5000 opening + 4000 income - 200 payment = 8800
    expect(chq.rawMinor).toBe(880_000n);
    // 200 purchase - 200 payment = 0 owed
    expect(card.rawMinor).toBe(0n);
    expect(card.netWorthMinor).toBe(0n);
    expect(card.availableCreditMinor).toBe(500_000n);
  });

  it('reports a card balance as owed, and negative for net worth', () => {
    const txns = [txn({ type: 'expense', amountMinor: 75_000n, accountId: 'acct-visa' })];
    const b = accountBalance(visa, txns);
    expect(b.rawMinor).toBe(75_000n);          // you owe $750
    expect(b.netWorthMinor).toBe(-75_000n);    // which subtracts from net worth
    expect(b.availableCreditMinor).toBe(425_000n);
  });
});

describe('refunds correctly offset spending', () => {
  it('nets a refund against expenses', () => {
    const txns = [
      txn({ type: 'expense', amountMinor: 8_127n, description: 'Amazon' }),
      txn({ type: 'refund', amountMinor: 8_127n, description: 'Amazon refund' }),
    ];
    expect(periodTotals(txns).expenses).toBe(0n);
  });

  it('nets a partial refund', () => {
    const txns = [
      txn({ type: 'expense', amountMinor: 10_000n }),
      txn({ type: 'refund', amountMinor: 2_500n }),
    ];
    expect(periodTotals(txns).expenses).toBe(7_500n);
  });

  it('treats sign consistently regardless of how the source stored it', () => {
    // Imports vary: some sources store expenses positive, some negative.
    expect(spendingAmount({ type: 'expense', baseAmountMinor: 5_000n })).toBe(5_000n);
    expect(spendingAmount({ type: 'expense', baseAmountMinor: -5_000n })).toBe(5_000n);
    expect(spendingAmount({ type: 'refund', baseAmountMinor: 5_000n })).toBe(-5_000n);
    expect(spendingAmount({ type: 'refund', baseAmountMinor: -5_000n })).toBe(-5_000n);
    expect(incomeAmount({ type: 'income', baseAmountMinor: -300_000n })).toBe(300_000n);
  });

  it('refunds reduce the category total they belong to', () => {
    const txns = [
      txn({ type: 'expense', amountMinor: 10_000n, categoryId: 'cat-shopping' }),
      txn({ type: 'refund', amountMinor: 3_000n, categoryId: 'cat-shopping' }),
    ];
    const totals = spendingByCategory(txns);
    expect(totals.find((c) => c.categoryId === 'cat-shopping')!.amountMinor).toBe(7_000n);
  });
});

describe('investments are saving, not spending', () => {
  it('excludes investments from expenses but subtracts them from liquid change', () => {
    const txns = [
      txn({ type: 'income', amountMinor: 500_000n }),
      txn({ type: 'expense', amountMinor: 200_000n }),
      txn({ type: 'investment', amountMinor: 100_000n }),
    ];
    const t = periodTotals(txns);
    expect(t.expenses).toBe(200_000n);
    expect(t.investments).toBe(100_000n);
    expect(t.netCashFlow).toBe(300_000n);
    expect(t.liquidChange).toBe(200_000n);
    expect(t.savingsRateBps).toBe(6000); // 60%
  });

  it('reports a zero savings rate rather than dividing by zero', () => {
    expect(periodTotals([txn({ type: 'expense', amountMinor: 100n })]).savingsRateBps).toBe(0);
    expect(periodTotals([]).savingsRateBps).toBe(0);
  });
});

describe('split transactions total correctly', () => {
  it('distributes a split across categories exactly', () => {
    const t = txn({
      type: 'expense', amountMinor: 10_000n, categoryId: null,
      splits: [
        { categoryId: 'cat-a', businessClassification: 'personal', amountMinor: 6_000n },
        { categoryId: 'cat-b', businessClassification: 'personal', amountMinor: 4_000n },
      ],
    });
    const totals = spendingByCategory([t]);
    const a = totals.find((c) => c.categoryId === 'cat-a')!;
    const b = totals.find((c) => c.categoryId === 'cat-b')!;
    expect(a.amountMinor + b.amountMinor).toBe(10_000n);
    expect(a.amountMinor).toBe(6_000n);
    expect(b.amountMinor).toBe(4_000n);
  });

  it('splits personal and business without losing or inventing money', () => {
    const t = txn({
      type: 'expense', amountMinor: 10_000n, businessClassification: 'split',
      splits: [
        { categoryId: 'cat-a', businessClassification: 'personal', amountMinor: 3_000n },
        { categoryId: 'cat-a', businessClassification: 'business', amountMinor: 7_000n },
      ],
    });
    const { personal, business } = splitByClassification([t]);
    expect(personal.expenses).toBe(3_000n);
    expect(business.expenses).toBe(7_000n);
    expect(personal.expenses + business.expenses).toBe(10_000n);
  });
});

describe('category rollups do not double count', () => {
  const categories: LedgerCategory[] = [
    { id: 'transport', parentId: null, name: 'Transportation', slug: 'transportation', kind: 'expense', classification: 'variable', necessity: 'essential', color: null, icon: null },
    { id: 'gas', parentId: 'transport', name: 'Gas', slug: 'gas', kind: 'expense', classification: 'variable', necessity: 'essential', color: null, icon: null },
    { id: 'parking', parentId: 'transport', name: 'Parking', slug: 'parking', kind: 'expense', classification: 'variable', necessity: 'discretionary', color: null, icon: null },
    { id: 'food', parentId: null, name: 'Food', slug: 'food', kind: 'expense', classification: 'variable', necessity: 'essential', color: null, icon: null },
  ];

  it('rolls children into the parent exactly once', () => {
    const leaves = spendingByCategory([
      txn({ amountMinor: 7_218n, categoryId: 'gas' }),
      txn({ amountMinor: 1_200n, categoryId: 'parking' }),
      txn({ amountMinor: 5_000n, categoryId: 'food' }),
    ]);
    const rolled = rollUpCategories(leaves, categories);
    expect(rolled.get('gas')).toBe(7_218n);
    expect(rolled.get('parking')).toBe(1_200n);
    expect(rolled.get('transport')).toBe(8_418n);
    expect(rolled.get('food')).toBe(5_000n);
  });

  it('survives a cycle in the category tree without hanging', () => {
    const cyclic: LedgerCategory[] = [
      { ...categories[0]!, id: 'a', parentId: 'b' },
      { ...categories[0]!, id: 'b', parentId: 'a' },
    ];
    const leaves = spendingByCategory([txn({ amountMinor: 100n, categoryId: 'a' })]);
    const rolled = rollUpCategories(leaves, cyclic);
    expect(rolled.get('a')).toBe(100n);
    expect(rolled.get('b')).toBe(100n);
  });
});

describe('balances', () => {
  it('starts from the opening balance and ignores transactions before it', () => {
    const txns = [
      txn({ type: 'expense', amountMinor: -10_000n, postedDate: '2026-08-15' }), // before opening
      txn({ type: 'expense', amountMinor: -10_000n, postedDate: '2026-09-05' }),
    ];
    expect(accountBalance(chequing, txns).rawMinor).toBe(490_000n);
  });

  it('respects an as-of date', () => {
    const txns = [
      txn({ type: 'expense', amountMinor: -10_000n, postedDate: '2026-09-05' }),
      txn({ type: 'expense', amountMinor: -10_000n, postedDate: '2026-09-20' }),
    ];
    expect(accountBalance(chequing, txns, '2026-09-10').rawMinor).toBe(490_000n);
    expect(accountBalance(chequing, txns, '2026-09-30').rawMinor).toBe(480_000n);
  });

  it('computes a cash position separating assets from debt', () => {
    const txns = [
      txn({ type: 'expense', amountMinor: -50_000n, accountId: 'acct-chq' }),
      txn({ type: 'expense', amountMinor: 30_000n, accountId: 'acct-visa' }),
    ];
    const balances = allAccountBalances([chequing, visa], txns);
    const pos = cashPosition([chequing, visa], balances);
    expect(pos.cashMinor).toBe(450_000n);
    expect(pos.debtMinor).toBe(30_000n);
    expect(pos.netMinor).toBe(420_000n);
  });
});

describe('time series', () => {
  it('buckets by calendar month and fills empty months', () => {
    const txns = [
      txn({ type: 'income', amountMinor: 100_000n, postedDate: '2026-07-15' }),
      txn({ type: 'expense', amountMinor: 40_000n, postedDate: '2026-07-20' }),
      txn({ type: 'expense', amountMinor: 10_000n, postedDate: '2026-09-02' }),
    ];
    const series = monthlySeries(txns, { start: '2026-07-01', end: '2026-09-30' });
    expect(series.map((s) => s.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(series[0]!.income).toBe(100_000n);
    expect(series[0]!.expenses).toBe(40_000n);
    expect(series[1]!.expenses).toBe(0n); // August had nothing, and must still appear
    expect(series[2]!.expenses).toBe(10_000n);
  });

  it('ranks merchants by spend and reports an average', () => {
    const txns = [
      txn({ amountMinor: 7_218n, merchantName: 'Shell' }),
      txn({ amountMinor: 6_000n, merchantName: 'Shell' }),
      txn({ amountMinor: 1_450n, merchantName: "McDonald's" }),
    ];
    const merchants = spendingByMerchant(txns);
    expect(merchants[0]!.merchantName).toBe('Shell');
    expect(merchants[0]!.amountMinor).toBe(13_218n);
    expect(merchants[0]!.transactionCount).toBe(2);
    expect(merchants[0]!.averageMinor).toBe(6_609n);
  });
});

import 'server-only';
import { eq, and } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import {
  accounts, categories, transactions, goals, budgets, budgetAllocations, workspaces, assets as assetsTable, liabilities as liabilitiesTable, holdings, debts, costShares, iouDebts,
} from '@/lib/db/schema';
import { ACCOUNT_NORMAL_BALANCE } from './bootstrap';
import { addDays, addMonths, startOfMonth, endOfMonth } from '@/lib/finance/period';
import type { IsoDate } from '@/lib/finance/types';

/**
 * Realistic demo data (spec §40): six months of income, spending, transfers,
 * subscriptions, refunds, investments and business activity.
 *
 * Deterministic — it uses a seeded PRNG, so the demo looks the same every time and a
 * bug reproduces. Random demo data makes screenshots and tests unreproducible.
 */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Spec {
  slug: string;
  merchant: string;
  minMinor: number;
  maxMinor: number;
  perMonth: number;
  account: 'chq' | 'visa';
}

const VARIABLE_SPEND: Spec[] = [
  { slug: 'groceries', merchant: 'Loblaws', minMinor: 4200, maxMinor: 16500, perMonth: 5, account: 'visa' },
  { slug: 'groceries', merchant: 'No Frills', minMinor: 3100, maxMinor: 9800, perMonth: 2, account: 'visa' },
  { slug: 'gas', merchant: 'Shell', minMinor: 5200, maxMinor: 9400, perMonth: 4, account: 'visa' },
  { slug: 'coffee', merchant: 'Tim Hortons', minMinor: 280, maxMinor: 1450, perMonth: 9, account: 'visa' },
  { slug: 'restaurants', merchant: 'SkipTheDishes', minMinor: 2400, maxMinor: 6800, perMonth: 3, account: 'visa' },
  { slug: 'fast-food', merchant: "McDonald's", minMinor: 900, maxMinor: 2400, perMonth: 3, account: 'visa' },
  { slug: 'general-shopping', merchant: 'Amazon', minMinor: 1500, maxMinor: 18900, perMonth: 4, account: 'visa' },
  { slug: 'pharmacy', merchant: 'Shoppers Drug Mart', minMinor: 1200, maxMinor: 6400, perMonth: 2, account: 'visa' },
  { slug: 'public-transit', merchant: 'PRESTO', minMinor: 2000, maxMinor: 4000, perMonth: 1, account: 'chq' },
  { slug: 'clothing', merchant: 'Uniqlo', minMinor: 4500, maxMinor: 14000, perMonth: 1, account: 'visa' },
  { slug: 'parking', merchant: 'Green P Parking', minMinor: 500, maxMinor: 2200, perMonth: 2, account: 'visa' },
  { slug: 'household', merchant: 'Dollarama', minMinor: 800, maxMinor: 3500, perMonth: 2, account: 'visa' },
];

const SUBSCRIPTIONS = [
  { slug: 'subscriptions', merchant: 'Netflix', amountMinor: 2099, day: 8 },
  { slug: 'subscriptions', merchant: 'Spotify', amountMinor: 1199, day: 14 },
  { slug: 'subscriptions', merchant: 'Disney+', amountMinor: 1199, day: 22 },
  { slug: 'software', merchant: 'Adobe', amountMinor: 2799, day: 3 },
  { slug: 'fitness', merchant: 'GoodLife Fitness', amountMinor: 5499, day: 2 },
  { slug: 'phone', merchant: 'Rogers', amountMinor: 8500, day: 18 },
  { slug: 'internet', merchant: 'Bell', amountMinor: 9500, day: 18 },
];

export async function seedDemoData(userId: string, workspaceId: string, today: IsoDate): Promise<number> {
  const rng = makeRng(20260914);

  return withUser(userId, async (tx) => {
    const cats = await tx.select({ id: categories.id, slug: categories.slug })
      .from(categories).where(eq(categories.workspaceId, workspaceId));
    const catId = new Map(cats.map((c) => [c.slug, c.id]));
    const ws = await tx.select({ currency: workspaces.baseCurrency })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const currency = ws[0]?.currency ?? 'CAD';

    const startDate = startOfMonth(addMonths(today, -5));

    /* ----- accounts ----- */
    const mkAccount = async (name: string, type: keyof typeof ACCOUNT_NORMAL_BALANCE, opening: bigint, limit?: bigint) => {
      const rows = await tx.insert(accounts).values({
        workspaceId, name, type: type as 'chequing',
        normalBalance: ACCOUNT_NORMAL_BALANCE[type] ?? 'debit',
        currency, openingBalanceMinor: opening, openingBalanceDate: startDate,
        creditLimitMinor: limit ?? null,
        institution: type === 'credit_card' ? 'RBC' : 'TD',
      }).returning({ id: accounts.id });
      return rows[0]!.id;
    };

    const chq = await mkAccount('Everyday Chequing', 'chequing', 562_500n);
    const sav = await mkAccount('High-Interest Savings', 'savings', 1_240_000n);
    const visa = await mkAccount('Visa Infinite', 'credit_card', 0n, 750_000n);
    const tfsa = await mkAccount('TFSA', 'investment', 1_850_000n);

    const acct = { chq, visa };
    const rows: (typeof transactions.$inferInsert)[] = [];

    const push = (
      accountId: string, date: IsoDate, description: string, merchantName: string | null,
      amountMinor: bigint, type: 'expense' | 'income' | 'transfer' | 'refund' | 'investment',
      slug: string | null, extra: Partial<typeof transactions.$inferInsert> = {},
    ) => {
      rows.push({
        workspaceId, accountId, postedDate: date, description,
        originalDescription: merchantName ? merchantName.toUpperCase() : description.toUpperCase(),
        merchantName, amountMinor, currency, baseAmountMinor: amountMinor, baseCurrency: currency,
        type, categoryId: slug ? catId.get(slug) ?? null : null,
        source: 'demo', createdBy: userId, ...extra,
      });
    };

    const pick = (min: number, max: number) => BigInt(Math.round(min + rng() * (max - min)));

    for (let m = 0; m < 6; m++) {
      const monthStart = addMonths(startDate, m);
      const monthEnd = endOfMonth(monthStart);
      const isCurrentMonth = monthEnd > today;
      const cutoff = isCurrentMonth ? today : monthEnd;
      const dayIn = (d: number) => {
        const date = addDays(monthStart, Math.min(d - 1, 27));
        return date > cutoff ? null : date;
      };

      /* Income: biweekly salary, plus freelance some months. */
      for (const day of [1, 15]) {
        const date = dayIn(day);
        if (date) push(chq, date, 'Payroll deposit', 'Acme Corp Payroll', 231_500n, 'income', 'salary', { isRecurring: true });
      }
      if (m % 2 === 1) {
        const date = dayIn(21);
        if (date) push(chq, date, 'Freelance invoice payment', 'Stripe', BigInt(80_000 + Math.round(rng() * 120_000)), 'income', 'freelance');
      }

      /* Fixed housing. */
      const rentDate = dayIn(1);
      if (rentDate) push(chq, rentDate, 'Rent', 'Maple Property Mgmt', -182_500n, 'expense', 'rent', { isRecurring: true });
      const hydroDate = dayIn(12);
      if (hydroDate) push(chq, hydroDate, 'Hydro bill', 'Toronto Hydro', -(pick(7800, 14500)), 'expense', 'utilities', { isRecurring: true });

      /* Subscriptions — stable amounts, which is what makes them detectable. */
      for (const sub of SUBSCRIPTIONS) {
        const date = dayIn(sub.day);
        if (!date) continue;
        // Netflix raises its price partway through, to exercise price-change detection.
        const bump = sub.merchant === 'Netflix' && m >= 4 ? 300 : 0;
        push(visa, date, sub.merchant, sub.merchant, BigInt(sub.amountMinor + bump), 'expense', sub.slug, { isRecurring: true });
      }

      /* Variable spending. */
      for (const spec of VARIABLE_SPEND) {
        const count = Math.max(0, Math.round(spec.perMonth * (0.7 + rng() * 0.6)));
        for (let i = 0; i < count; i++) {
          const date = dayIn(1 + Math.floor(rng() * 27));
          if (!date) continue;
          push(acct[spec.account], date, spec.merchant, spec.merchant, pick(spec.minMinor, spec.maxMinor), 'expense', spec.slug);
        }
      }

      /* A refund, so spending nets down correctly. */
      if (m === 2 || m === 4) {
        const date = dayIn(19);
        if (date) push(visa, date, 'Amazon refund', 'Amazon', 8_127n, 'refund', 'general-shopping');
      }

      /* Transfers: savings and the credit-card payment. Neither counts as spending. */
      const saveDate = dayIn(16);
      if (saveDate) {
        const group = crypto.randomUUID();
        push(chq, saveDate, 'Transfer to savings', null, -60_000n, 'transfer', 'transfer', { transferGroupId: group, isRecurring: true });
        push(sav, saveDate, 'Transfer from chequing', null, 60_000n, 'transfer', 'transfer', { transferGroupId: group, isRecurring: true });
      }
      const payDate = dayIn(20);
      if (payDate) {
        const group = crypto.randomUUID();
        push(chq, payDate, 'Credit card payment', null, -145_000n, 'transfer', 'transfer', { transferGroupId: group });
        push(visa, payDate, 'Payment received - thank you', null, -145_000n, 'transfer', 'transfer', { transferGroupId: group });
      }

      /* Investment contribution — saving, not spending. */
      const investDate = dayIn(17);
      if (investDate) {
        const group = crypto.randomUUID();
        push(chq, investDate, 'TFSA contribution', null, -50_000n, 'investment', 'brokerage', { transferGroupId: group, isRecurring: true });
        push(tfsa, investDate, 'TFSA contribution', null, 50_000n, 'investment', 'brokerage', { transferGroupId: group });
      }

      /* Business activity in the same workspace, classified as business. */
      const bizDate = dayIn(9);
      if (bizDate) {
        push(visa, bizDate, 'Figma subscription', 'Figma', 1_800n, 'expense', 'software', { businessClassification: 'business', isRecurring: true, taxRelevance: 'business_expense' });
        push(visa, bizDate, 'Google Ads', 'Google Ads', pick(8_000, 24_000), 'expense', 'advertising', { businessClassification: 'business', taxRelevance: 'business_expense' });
      }
    }

    // Insert in batches so a large demo does not exceed parameter limits.
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(transactions).values(rows.slice(i, i + 200));
    }

    /* ----- split with friends: one dinner they owe you for, one thing you owe ----- */
    const splitDay = addDays(today, -3);
    const [dinner] = await tx.insert(transactions).values({
      workspaceId, accountId: visa, postedDate: splitDay, description: 'Dinner at Pai', originalDescription: 'PAI NORTHERN THAI',
      merchantName: 'Pai Northern Thai', amountMinor: 9_600n, currency, baseAmountMinor: 9_600n, baseCurrency: currency,
      type: 'expense', categoryId: catId.get('restaurants') ?? null, source: 'demo', createdBy: userId,
    }).returning({ id: transactions.id });
    await tx.insert(costShares).values({ workspaceId, transactionId: dinner!.id, kind: 'split', people: 3, expectBack: true, withWhom: 'Sam, Priya', createdBy: userId });
    const [concert] = await tx.insert(transactions).values({
      workspaceId, accountId: chq, postedDate: addDays(today, -6), description: 'Concert tickets', originalDescription: 'Concert tickets',
      merchantName: 'Concert tickets', amountMinor: -4_500n, currency, baseAmountMinor: -4_500n, baseCurrency: currency,
      type: 'expense', categoryId: catId.get('events') ?? null, source: 'demo', createdBy: userId, notes: 'Your part; Priya paid',
    }).returning({ id: transactions.id });
    await tx.insert(iouDebts).values({ workspaceId, person: 'Priya', description: 'Concert tickets', amountMinor: 4_500n, transactionId: concert!.id, createdBy: userId });

    /* ----- goals ----- */
    await tx.insert(goals).values([
      { workspaceId, name: 'Emergency fund', kind: 'emergency_fund', targetMinor: 1_500_000n, currentMinor: 1_240_000n, currency, targetDate: addMonths(today, 6), priority: 1, accountId: sav, monthlyContributionMinor: 60_000n },
      { workspaceId, name: 'Japan trip', kind: 'vacation', targetMinor: 700_000n, currentMinor: 185_000n, currency, targetDate: addMonths(today, 11), priority: 2, monthlyContributionMinor: 45_000n },
      { workspaceId, name: 'New car', kind: 'car', targetMinor: 2_500_000n, currentMinor: 320_000n, currency, targetDate: addMonths(today, 24), priority: 3, monthlyContributionMinor: 80_000n },
    ]);

    /* ----- budget, prefilled from the demo's own averages ----- */
    const budgetRows = await tx.insert(budgets).values({
      workspaceId, name: 'Monthly budget', method: 'category', period: 'monthly',
      periodStart: startOfMonth(today), expectedIncomeMinor: 463_000n, isActive: true,
    }).returning({ id: budgets.id });
    const budgetId = budgetRows[0]!.id;

    const allocationSpecs: [string, bigint][] = [
      ['rent', 182_500n], ['groceries', 65_000n], ['restaurants', 18_000n], ['fast-food', 8_000n],
      ['coffee', 9_000n], ['gas', 32_000n], ['general-shopping', 35_000n], ['subscriptions', 5_000n],
      ['utilities', 12_000n], ['phone', 8_500n], ['internet', 9_500n], ['fitness', 5_500n],
      ['pharmacy', 8_000n], ['clothing', 10_000n],
    ];
    await tx.insert(budgetAllocations).values(
      allocationSpecs
        .filter(([slug]) => catId.has(slug))
        .map(([slug, amountMinor], i) => ({ workspaceId, budgetId, categoryId: catId.get(slug)!, amountMinor, sortOrder: i })),
    );

    /* ----- position ----- */
    await tx.insert(assetsTable).values([
      { workspaceId, name: 'Vehicle (2021 Civic)', category: 'vehicle', valueMinor: 1_850_000n, currency, asOf: today },
    ]);
    await tx.insert(liabilitiesTable).values([
      { workspaceId, name: 'Student loan', category: 'student_loan', balanceMinor: 1_120_000n, currency, asOf: today },
    ]);
    await tx.insert(holdings).values([
      { workspaceId, accountId: tfsa, symbol: 'VFV', name: 'Vanguard S&P 500 Index ETF', assetClass: 'etf', quantity: '112.4000000000', costBasisMinor: 1_420_000n, currentValueMinor: 1_688_000n, valueAsOf: today, currency },
      { workspaceId, accountId: tfsa, symbol: 'XEQT', name: 'iShares All-Equity ETF', assetClass: 'etf', quantity: '48.0000000000', costBasisMinor: 430_000n, currentValueMinor: 462_000n, valueAsOf: today, currency },
    ]);
    await tx.insert(debts).values([
      { workspaceId, name: 'Student loan', balanceMinor: 1_120_000n, currency, aprBps: 590, minPaymentMinor: 21_000n, paymentDay: 5, strategyOrder: 1 },
      { workspaceId, name: 'Visa Infinite', accountId: visa, balanceMinor: 186_000n, currency, aprBps: 1999, minPaymentMinor: 5_000n, paymentDay: 20, strategyOrder: 0 },
    ]);

    await tx.update(workspaces).set({ isDemo: true }).where(eq(workspaces.id, workspaceId));

    return rows.length;
  });
}

export async function hasAnyTransactions(userId: string, workspaceId: string): Promise<boolean> {
  const rows = await withUser(userId, (tx) =>
    tx.select({ id: transactions.id }).from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId))).limit(1),
  );
  return rows.length > 0;
}

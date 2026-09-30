import type { Summary } from '@/lib/summary';

/**
 * Sample figures for design review ONLY (EXPO_PUBLIC_PREVIEW=1).
 *
 * Same shape the server returns, so the screens cannot tell the difference and
 * every screen can be reviewed without an account. Nothing here is anyone's money.
 */
export const previewSummary: Summary = {
  currency: 'CAD',
  today: '2026-09-30',
  hasData: true,
  hasBalance: true,
  home: {
    safeToSpendMinor: 124_000,
    explanation: '$3,040 in cash, minus $1,800 of bills still to pay this month.',
    short: false,
    daysLeft: 1,
    nextIncome: { name: 'Payday', date: '2026-10-01', amountMinor: 240_000 },
    upcoming: [
      { name: 'Rent', date: '2026-10-01', amountMinor: 180_000 },
      { name: 'Phone', date: '2026-10-03', amountMinor: 6_000 },
      { name: 'Spotify', date: '2026-10-05', amountMinor: 1_199 },
    ],
    trend: [
      { month: '2026-04', netMinor: 42_000 }, { month: '2026-05', netMinor: 61_000 }, { month: '2026-06', netMinor: -12_000 },
      { month: '2026-07', netMinor: 38_000 }, { month: '2026-08', netMinor: 55_000 }, { month: '2026-09', netMinor: 71_000 },
    ],
  },
  spending: {
    spentMinor: 142_350,
    spentDeltaMinor: -8_600,
    budgetMinor: 200_000,
    categories: [
      { id: '1', name: 'Groceries', icon: '🛒', amountMinor: 48_210, budgetMinor: 55_000 },
      { id: '2', name: 'Eating out', icon: '🍽️', amountMinor: 31_540, budgetMinor: 25_000 },
      { id: '3', name: 'Transport', icon: '🚗', amountMinor: 18_900, budgetMinor: 30_000 },
      { id: '4', name: 'Coffee', icon: '☕', amountMinor: 6_700, budgetMinor: 8_000 },
    ],
    recent: [
      { id: 'a', name: 'No Frills', date: '2026-09-30', amountMinor: -6_432, icon: '🛒', category: 'Groceries' },
      { id: 'b', name: 'Presto', date: '2026-09-30', amountMinor: -1_000, icon: '🚗', category: 'Transport' },
      { id: 'c', name: 'Tim Hortons', date: '2026-09-29', amountMinor: -485, icon: '☕', category: 'Coffee' },
    ],
  },
  goals: [
    { id: 'g1', name: 'Emergency fund', currentMinor: 320_000, targetMinor: 1_000_000, targetDate: '2027-06-30', monthlyMinor: 75_000, achieved: false, status: 'on_track' },
    { id: 'g2', name: 'Japan trip', currentMinor: 85_000, targetMinor: 400_000, targetDate: '2027-03-31', monthlyMinor: 60_000, achieved: false, status: 'behind' },
    { id: 'g3', name: 'New laptop', currentMinor: 140_000, targetMinor: 200_000, targetDate: '2026-12-31', monthlyMinor: 20_000, achieved: false, status: 'on_track' },
  ],
  invest: {
    totalValueMinor: 1_284_620,
    gainMinor: 151_230,
    gainPct: 13.34,
    holdings: [
      { symbol: 'VFV', name: 'Vanguard S&P 500 Index ETF', valueMinor: 842_310, gainMinor: 112_000, changePct: 0.8 },
      { symbol: 'XEQT', name: 'iShares Core Equity ETF Portfolio', valueMinor: 442_310, gainMinor: 39_230, changePct: -0.3 },
    ],
    watchlist: [
      { symbol: 'NVDA', name: 'NVIDIA', priceMinor: 18_842, changePct: 1.8 },
      { symbol: 'SHOP', name: 'Shopify', priceMinor: 14_210, changePct: -0.9 },
    ],
  },
};

/** Sample month of transactions for the See all screen in preview mode. */
export const previewTransactions = {
  month: '2026-09',
  transactions: [
    { id: 't1', name: 'No Frills', date: '2026-09-30', amountMinor: -6_432, category: 'Groceries', icon: '🛒' },
    { id: 't2', name: 'Presto', date: '2026-09-30', amountMinor: -1_000, category: 'Transport', icon: '🚗' },
    { id: 't3', name: 'Tim Hortons', date: '2026-09-29', amountMinor: -485, category: 'Coffee', icon: '☕' },
    { id: 't4', name: 'Spotify', date: '2026-09-28', amountMinor: -1_199, category: 'Subscriptions', icon: '🎵' },
    { id: 't5', name: 'Payroll', date: '2026-09-26', amountMinor: 240_000, category: 'Salary', icon: '💼' },
    { id: 't6', name: 'Uber Eats', date: '2026-09-25', amountMinor: -3_120, category: 'Eating out', icon: '🍽️' },
  ],
  totals: { outMinor: 12_236, inMinor: 240_000 },
  categories: [
    { id: 'c1', name: 'Groceries', icon: '🛒', kind: 'expense', parentId: null },
    { id: 'c2', name: 'Eating out', icon: '🍽️', kind: 'expense', parentId: null },
    { id: 'c3', name: 'Transport', icon: '🚗', kind: 'expense', parentId: null },
    { id: 'c4', name: 'Shopping', icon: '🛍️', kind: 'expense', parentId: null },
    { id: 'c5', name: 'Bills', icon: '💡', kind: 'expense', parentId: null },
    { id: 'c6', name: 'Salary', icon: '💼', kind: 'income', parentId: null },
  ],
  accounts: [{ id: 'a1', name: 'Chequing', type: 'chequing' }],
};

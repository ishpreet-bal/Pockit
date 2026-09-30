/**
 * Sample figures for design review ONLY.
 *
 * Every screen that reads from here shows a "Design preview" badge. Step 3 replaces
 * this module with calls to the Pockit server; nothing in it is anyone's money.
 */
const days = Array.from({ length: 30 }, (_, i) => i + 1);

export const preview = {
  name: 'Ish',
  safeToSpendMinor: 124_000,
  changeVsLastMonthMinor: 8_600,
  balanceSeries: {
    values: [98, 102, 99, 104, 101, 108, 106, 103, 110, 112, 109, 115, 111, 118, 116, 121, 119, 117, 123, 126, 122, 128, 125, 120, 118, 121, 119, 122, 123, 124].map((v) => v * 1000),
    labels: days.map((d) => `Sep ${d}`),
  },
  upcoming: [
    { id: '1', name: 'Rent', date: 'Oct 1', amountMinor: 180_000, icon: 'house.fill' },
    { id: '2', name: 'Phone', date: 'Oct 3', amountMinor: 6_000, icon: 'iphone' },
    { id: '3', name: 'Spotify', date: 'Oct 5', amountMinor: 1_199, icon: 'music.note' },
  ],
  nextIncome: { name: 'Payday', date: 'Oct 1', amountMinor: 240_000 },

  spending: {
    spentMinor: 142_350,
    budgetMinor: 200_000,
    dayOfMonth: 30,
    daysInMonth: 30,
    categories: [
      { name: 'Groceries', icon: 'cart', spentMinor: 48_210, budgetMinor: 55_000 },
      { name: 'Eating out', icon: 'fork.knife', spentMinor: 31_540, budgetMinor: 25_000 },
      { name: 'Transport', icon: 'car', spentMinor: 18_900, budgetMinor: 30_000 },
      { name: 'Coffee', icon: 'cup.and.saucer', spentMinor: 6_700, budgetMinor: 8_000 },
    ],
    recent: [
      { id: 'a', name: 'No Frills', category: 'Groceries', date: 'Today', amountMinor: -6_432, icon: 'cart' },
      { id: 'b', name: 'Presto', category: 'Transport', date: 'Today', amountMinor: -1_000, icon: 'car' },
      { id: 'c', name: 'Tim Hortons', category: 'Coffee', date: 'Yesterday', amountMinor: -485, icon: 'cup.and.saucer' },
      { id: 'd', name: 'Payroll', category: 'Income', date: 'Sep 15', amountMinor: 240_000, icon: 'building.columns' },
    ],
  },

  goals: [
    { id: 'g1', name: 'Emergency fund', icon: 'lifepreserver', currentMinor: 320_000, targetMinor: 1_000_000, by: 'Jun 2027', monthlyMinor: 75_000, status: 'On track' },
    { id: 'g2', name: 'Japan trip', icon: 'airplane', currentMinor: 85_000, targetMinor: 400_000, by: 'Mar 2027', monthlyMinor: 60_000, status: 'A little behind' },
    { id: 'g3', name: 'New laptop', icon: 'laptopcomputer', currentMinor: 140_000, targetMinor: 200_000, by: 'Dec 2026', monthlyMinor: 20_000, status: 'On track' },
  ],

  invest: {
    totalMinor: 1_284_620,
    changeMinor: 51_230,
    changePct: 4.15,
    series: [100, 101, 99, 102, 104, 103, 105, 107, 106, 108, 107, 109, 111, 110, 112, 113, 111, 114, 115, 114, 116, 117, 116, 118, 119, 118, 120, 121, 122, 124].map((v) => v * 10_359),
    holdings: [
      { symbol: 'VFV', name: 'Vanguard S&P 500 Index ETF', valueMinor: 842_310, changePct: 5.2 },
      { symbol: 'XEQT', name: 'iShares Core Equity ETF Portfolio', valueMinor: 442_310, changePct: 2.1 },
    ],
    watchlist: [
      { symbol: 'NVDA', name: 'NVIDIA', priceMinor: 18_842, changePct: 1.8 },
      { symbol: 'SHOP', name: 'Shopify', priceMinor: 14_210, changePct: -0.9 },
      { symbol: 'AAPL', name: 'Apple', priceMinor: 25_630, changePct: 0.4 },
    ],
  },
} as const;

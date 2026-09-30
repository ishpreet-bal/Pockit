/**
 * Sample figures for design review ONLY.
 *
 * Every screen that reads from here shows a "Design preview" badge. Step 3 replaces
 * this module with calls to the Pockit server; nothing in it is anyone's money.
 */
export const preview = {
  name: 'Ish',
  daysLeftInMonth: 1,
  monthLabel: 'September',
  safeToSpendMinor: 124_000,
  cashMinor: 304_000,
  billsLeftMinor: 180_000,
  upcoming: [
    { id: '1', name: 'Rent', date: 'Oct 1', amountMinor: 180_000, icon: 'house.fill' },
    { id: '2', name: 'Phone', date: 'Oct 3', amountMinor: 6_000, icon: 'iphone' },
    { id: '3', name: 'Spotify', date: 'Oct 5', amountMinor: 1_199, icon: 'music.note' },
  ],
  nextIncome: { name: 'Payday', date: 'Oct 1', amountMinor: 240_000 },
  goal: { name: 'Emergency fund', currentMinor: 320_000, targetMinor: 1_000_000, more: 1 },
  investing: { count: 2, symbols: ['VFV', 'XEQT'] },
} as const;

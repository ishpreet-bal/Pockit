import type { TourStep } from './tour';

/**
 * "Explore this page" — a walkthrough for each section, explaining what every part
 * of it MEANS, not just where it is.
 *
 * Targets are semantic hooks (`aria-label` on sections, or `data-tour`) rather than
 * class names, so a redesign does not silently break them. A step whose target is
 * absent — a page with no warnings has no warnings section — is skipped by the tour
 * rather than pointed at nothing.
 *
 * Each list opens with a centred card so the person knows what they have started
 * and how long it is before anything is highlighted.
 */
export const PAGE_TOURS: { prefix: string; label: string; steps: TourStep[] }[] = [
  {
    prefix: '/overview',
    label: 'Overview',
    steps: [
      { title: 'Your Overview', body: 'This is the page to glance at every day. A few stops to explain what each number means.' },
      {
        target: '[aria-label="Where you stand"]',
        title: 'Available after upcoming bills',
        body: 'The cash across your accounts, minus the bills still due this month. It is deliberately smaller than your balance — money already promised to a bill is not really spendable.',
      },
      {
        target: '[aria-label="Coming up"]',
        title: 'The next 30 days',
        body: 'Every bill and payday Pockit expects, in date order. These come from your recurring payments, so if something is missing, add it there.',
      },
      {
        target: '[aria-label="Where your money went"]',
        title: 'Where it went',
        body: 'This month’s spending by category. Tap a slice to see the transactions behind it.',
      },
      {
        target: '[aria-label="On track"]',
        title: 'Are you on track?',
        body: 'Your budget and goals in one line each — whether this month is running ahead of plan or behind it.',
      },
      {
        target: '[aria-label="Recent activity"]',
        title: 'Recent activity',
        body: 'Your latest transactions. Search here to find one quickly without leaving the page.',
      },
    ],
  },
  {
    prefix: '/transactions',
    label: 'Transactions',
    steps: [
      { title: 'Your transactions', body: 'Everything that has come in or gone out. Here is how to find and add things.' },
      {
        target: '[aria-label="Transaction view"]',
        title: 'Choose a time window',
        body: 'This month, what is still to come, or everything before. Upcoming shows scheduled bills that have not happened yet.',
      },
      {
        target: '[aria-label="Search transactions"]',
        title: 'Search and filter',
        body: 'Type a shop or description, or tap a category below to show only that. Filters live in the address bar, so a filtered view can be bookmarked.',
      },
      {
        target: '[aria-label="Add transaction"]',
        title: 'Add one yourself',
        body: 'As you type what it was, Pockit suggests things you have entered before — and picking one fills in the category too.',
        prefer: 'left',
      },
    ],
  },
  {
    prefix: '/budget',
    label: 'Budget',
    steps: [
      { title: 'Your budget', body: 'A plan for the month, and how the month is actually going against it.' },
      {
        target: '[data-tour="budget-pace"]',
        title: 'Are you on pace?',
        body: 'Compares how much of the month has passed with how much of the budget is spent. Spending faster than the calendar is the early warning.',
      },
      {
        target: '[data-tour="budget-plan"]',
        title: 'Your plan, category by category',
        body: 'Each bar is one category: how much you set aside and how much is gone. Categories marked essential are never suggested for cuts.',
      },
      {
        target: '[data-tour="budget-warnings"]',
        title: 'Worth a look',
        body: 'Anything running hot this month, with a suggested next step.',
      },
    ],
  },
  {
    prefix: '/goals',
    label: 'Goals',
    steps: [
      { title: 'Your goals', body: 'What you are saving toward, and an honest answer to whether your money covers it.' },
      {
        target: '[data-tour="goals-summary"]',
        title: 'All goals together',
        body: '"Needed monthly" is what every goal requires combined. "Available monthly" is what your last three months suggest you actually have spare. If the first is bigger, something has to give.',
      },
      {
        target: '[data-tour="goals-list"]',
        title: 'Each goal, on its own terms',
        body: 'Every goal is judged by what KIND of goal it is. An emergency fund is measured against your own monthly costs; a holiday is treated as the one that can wait.',
      },
      {
        target: '[data-tour="goal-slider"]',
        title: 'What if it took longer?',
        body: 'Drag to see what a later finish date would cost per month. Often the kindest fix is time, not cuts.',
      },
      {
        target: '[data-tour="ask-pock-context"]',
        title: 'Ask about this goal',
        body: 'Opens Pock already knowing which goal you mean, so you can ask "can I afford to finish this sooner?" directly.',
      },
    ],
  },
  {
    prefix: '/calendar',
    label: 'Calendar',
    steps: [
      { title: 'Your calendar', body: 'When money arrives and when it leaves, so you can see whether pay lands before a bill.' },
      {
        target: '[data-tour="calendar-grid"]',
        title: 'The month at a glance',
        body: 'Each day shows what is due and what arrives. A day heavy with bills just before payday is the one to watch.',
      },
      {
        target: '[data-tour="calendar-nav"]',
        title: 'Move through months',
        body: 'Look ahead to plan, or back to see what happened. "Today" jumps back to the current month.',
        prefer: 'left',
      },
    ],
  },
  {
    prefix: '/investing',
    label: 'Investing',
    steps: [
      { title: 'Investing', body: 'Research, follow and understand investments. Nothing here buys or sells anything.' },
      {
        target: '[data-tour="invest-search"]',
        title: 'Search anything',
        body: 'Type a ticker or a company name — "nv" finds NVIDIA, "s&p" finds the index funds. Typos are fine.',
      },
      {
        target: '[data-tour="invest-sections"]',
        title: 'Sections',
        body: 'Stocks, ETFs and Crypto are for exploring. Watchlist is what you follow. Portfolio is what you actually own — the only part that counts toward your net worth.',
      },
    ],
  },
];

export function tourForPath(pathname: string) {
  return PAGE_TOURS.find((t) => pathname === t.prefix || pathname.startsWith(`${t.prefix}/`)) ?? null;
}

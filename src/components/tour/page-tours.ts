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
    label: 'Home',
    steps: [
      { title: 'Home', body: 'Everything here answers one question: am I okay this month?' },
      {
        target: '[aria-label="Where you stand"]',
        title: 'Safe to spend',
        body: 'The money in your accounts, minus bills still due this month. It\u2019s smaller than your balance on purpose — money already promised to a bill isn\u2019t really yours to spend.',
      },
      {
        target: '[aria-label="Coming up"]',
        title: 'Coming up',
        body: 'Your next few bills, in date order. They come from Bills & subscriptions in More.',
      },
      {
        target: 'a[aria-label="Goals"]',
        title: 'Your goals',
        body: 'Your top goal at a glance. Tap to see them all.',
      },
      {
        target: 'a[aria-label="Investing"]',
        title: 'Investing',
        body: 'What you own and what you\u2019re following. Tap to explore stocks and funds.',
      },
    ],
  },
  {
    prefix: '/transactions',
    label: 'Spending',
    steps: [
      { title: 'Spending', body: 'Where your money went this month, and everything you\u2019ve spent.' },
      {
        target: '[aria-label="Search transactions"]',
        title: 'Find anything',
        body: 'Search by shop or description, or tap a category to see only that.',
      },
      {
        target: '[aria-label="Add transaction"]',
        title: 'Add spending',
        body: 'Start typing and Pockit suggests things you\u2019ve added before — picking one fills in the category too.',
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

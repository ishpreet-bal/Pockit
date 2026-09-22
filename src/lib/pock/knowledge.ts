import 'server-only';

/**
 * What Pock knows about Pockit itself.
 *
 * This is the answer to "how do I create a budget?" — a question no amount of
 * general financial knowledge can answer, because it is about THIS application.
 *
 * Two rules keep it from rotting, which is the failure mode of every in-app help
 * corpus ever written:
 *
 *  1. Each entry names the ROUTE it describes. `knowledge.test.ts` asserts every
 *     route here exists in `src/app`, so deleting or moving a page fails the build
 *     rather than leaving Pock confidently directing people to a 404.
 *  2. Entries describe behaviour and location, never exact button pixel-copy that
 *     drifts on every design pass.
 *
 * It is retrieved from, not sent wholesale: `relevantTo()` picks the few entries a
 * question is actually about.
 */

export interface HelpEntry {
  id: string;
  /** The route this is about. Verified to exist by the test suite. */
  route: string;
  title: string;
  /** Words that should pull this entry in. Kept broad — people do not use our nouns. */
  keywords: string[];
  body: string;
}

export const HELP: HelpEntry[] = [
  {
    id: 'overview',
    route: '/overview',
    title: 'Overview — the home screen',
    keywords: ['overview', 'dashboard', 'home', 'available', 'left to spend', 'summary', 'net'],
    body: `Overview is the home screen. Its headline figure is "available after upcoming bills": the
cash across your accounts, minus the bills still scheduled this month. It is deliberately not your
raw balance, because money already committed to a bill is not really spendable.
Below it: what came in, what you spent, what is still to pay, the next 30 days of scheduled items,
and where the money went by category.`,
  },
  {
    id: 'transactions-add',
    route: '/transactions',
    title: 'Adding and editing transactions',
    keywords: ['transaction', 'add', 'spend', 'expense', 'income', 'delete', 'edit', 'merchant', 'receipt'],
    body: `Transactions lists everything. "Add" opens a small form: amount, what it was, category,
date and account. The description box suggests things you have entered before, and picking a
suggestion also fills in the category you usually use for it.
To edit or delete one, open the transaction from the list; delete is inside that view.
Filter with the search box, the category chips, or the account dropdown — filters live in the URL,
so a filtered view can be bookmarked and the back button undoes it.`,
  },
  {
    id: 'recurring',
    route: '/recurring',
    title: 'Recurring bills and income',
    keywords: ['recurring', 'bill', 'subscription', 'rent', 'salary', 'repeat', 'monthly', 'regular'],
    body: `Recurring holds anything that repeats: rent, insurance, subscriptions, loan payments, pay.
Each has an amount, a frequency (weekly, biweekly, twice monthly, monthly, yearly) and a next date.
These drive the "still to pay this month" figure on Overview and the next-30-days list.
You can add one directly — it does not require importing any transaction history first.`,
  },
  {
    id: 'budget',
    route: '/budget',
    title: 'Budgets',
    keywords: ['budget', 'limit', 'category', 'overspend', 'plan', 'allocate', 'envelope'],
    body: `Budget sets a monthly limit per category and tracks spending against it.
Categories are marked fixed or variable, and essential or discretionary. Those two flags matter
beyond the budget screen: the goal feasibility calculation only ever suggests reducing categories
marked discretionary, so how you classify them changes the advice you get.
Change a classification in Settings, under category classifications.`,
  },
  {
    id: 'goals',
    route: '/goals',
    title: 'Goals',
    keywords: ['goal', 'save', 'saving', 'target', 'emergency fund', 'progress', 'deadline'],
    body: `A goal has a name, a target amount, what you have so far, an optional target date and a
monthly contribution. Pockit works out what the date requires per month and compares it with your
available cash flow, estimated from the last three months of activity.
If there is a gap it proposes reductions from your discretionary categories, capped at 30% of each —
and it says plainly when those reductions would NOT be enough to close the gap.
The "what if I took longer" slider shows what a different deadline would cost per month.
Goal type matters: an emergency fund is measured against your own outgoings, and debt payoff is
treated differently because delaying it accrues interest.`,
  },
  {
    id: 'investing',
    route: '/investing',
    title: 'Investing',
    keywords: ['invest', 'stock', 'etf', 'crypto', 'watchlist', 'portfolio', 'ticker', 'share', 'market'],
    body: `Investing has its own sections: Overview, Stocks, ETFs, Crypto, Watchlist and Portfolio.
Search from the box at the top by ticker or company name. Every instrument opens a page with a
chart (1D to MAX), key statistics, and analysis.
The star on that page follows it; with more than one list, the caret beside the star chooses which.
Watchlists are named and you can have several.
Following something is NOT owning it — a watchlist item never counts towards your net worth.
Holdings you actually own are recorded under Accounts.`,
  },
  {
    id: 'market-data',
    route: '/settings',
    title: 'Where market prices come from',
    keywords: ['price', 'delayed', 'real time', 'market data', 'sample', 'quote', 'chart missing'],
    body: `Prices come from a market-data provider configured on the deployment. Every figure on
screen carries its source and timestamp, and anything simulated is labelled "sample data, not a
real market".
If prices are blank or charts say unavailable, Settings → Market data runs a live check and reports
whether the key is missing, rejected or rate-limited.`,
  },
  {
    id: 'accounts',
    route: '/accounts',
    title: 'Accounts, debts and holdings',
    keywords: ['account', 'balance', 'debt', 'credit card', 'loan', 'net worth', 'holding', 'own'],
    body: `Accounts holds everything you own or owe: chequing, savings, cash, credit cards, loans,
mortgages and investment accounts. Balances are derived from transactions rather than typed in,
so they always agree with the ledger.
Investments you actually own are added here, and those are what count towards net worth.`,
  },
  {
    id: 'import',
    route: '/imports/new',
    title: 'Importing statements',
    keywords: ['import', 'csv', 'statement', 'upload', 'bank', 'excel', 'pdf', 'screenshot'],
    body: `Import accepts CSV, Excel, PDF and images of statements. Everything goes to a review
screen first — nothing is written to your ledger until you accept it. Duplicates are detected
against what you already have, and a whole import can be rolled back afterwards.
CSV, Excel and text PDFs are parsed on the server and never sent to an AI provider. Only
screenshots and scanned PDFs are, because extracting those requires it.`,
  },
  {
    id: 'calendar',
    route: '/calendar',
    title: 'Calendar',
    keywords: ['calendar', 'when', 'due', 'upcoming', 'payday', 'schedule'],
    body: `Calendar lays out scheduled income and bills by date, so you can see whether money lands
before a bill leaves. It reads from your recurring items.`,
  },
  {
    id: 'settings-income',
    route: '/settings',
    title: 'Changing your income, currency and personal details',
    keywords: ['income', 'salary', 'change income', 'currency', 'timezone', 'name', 'profile', 'settings'],
    body: `Settings holds your name, base currency, timezone and date format.
Income itself is not a single setting — it is whatever is recorded as income in Recurring, which is
what the calculations read. To change your income, edit the recurring income there.
Settings also has category classifications, privacy and file retention, data export, two-step
verification, and the market-data check.`,
  },
  {
    id: 'two-factor',
    route: '/settings',
    title: 'Two-step verification',
    keywords: ['2fa', 'two factor', 'two-step', 'security', 'authenticator', 'recovery code', 'password'],
    body: `Settings → Two-step verification. Scan the QR with any authenticator app, enter the code
to confirm, and save the ten recovery codes — they are shown once and never again.
Each code from your app works once. Turning 2FA off requires your account password.
If you lose your phone, type a recovery code into the same box the six digits go in.`,
  },
  {
    id: 'export-privacy',
    route: '/settings',
    title: 'Your data, export and deletion',
    keywords: ['export', 'download', 'delete', 'privacy', 'data', 'gdpr', 'start over', 'leave'],
    body: `Settings → Export your data downloads CSVs of transactions, monthly summaries, goals and
categories, with both original and converted amounts.
"Start over" erases the data in a workspace and keeps your sign-in. Your data is private to your
workspace and enforced at the database level, not only in the app's queries.`,
  },
  {
    id: 'demo',
    route: '/settings',
    title: 'Demo data',
    keywords: ['demo', 'sample', 'example', 'fake data', 'clear demo', 'my own'],
    body: `A demo workspace is filled with generated example data so the app can be explored before
you have entered anything. It is labelled with a banner at the top of Settings, and
"Clear it and start fresh" empties it completely so you can begin with your own.`,
  },
  {
    id: 'terms',
    route: '/overview',
    title: 'What Pockit\'s terms mean',
    keywords: ['what does', 'mean', 'available monthly', 'discretionary', 'essential', 'fixed', 'variable', 'terminology'],
    body: `Available after upcoming bills — cash on hand minus bills still scheduled this month.
Available monthly (in goals) — what your last three months suggest is spare each month, after
other goals already claim their share. It is an estimate from past behaviour, not a promise.
Essential vs discretionary — whether you could go without it. Only discretionary categories are
ever suggested for reduction.
Fixed vs variable — whether the amount is the same each month. Fixed costs are predictable;
variable ones are where a budget usually bites.`,
  },
];

/**
 * Words too common to indicate a topic. A title hit on one of these is noise.
 */
const TITLE_STOPWORDS = new Set([
  'what', 'where', 'when', 'your', 'this', 'that', 'with', 'from', 'they', 'them',
  'does', 'mean', 'means', 'about', 'into', 'over', 'have', 'here', 'been', 'and',
  'the', 'for', 'are', 'you', 'its', 'pockit',
]);

/**
 * The few entries a question is about.
 *
 * Scored by keyword and title hits rather than sent wholesale — the brief for Pock
 * is already long, and burying the relevant page in fourteen irrelevant ones makes
 * answers worse, not better.
 */
export function relevantTo(question: string, limit = 4): HelpEntry[] {
  const text = question.toLowerCase();
  const scored = HELP.map((entry) => {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (text.includes(keyword)) score += keyword.includes(' ') ? 3 : 2;
    }
    for (const word of entry.title.toLowerCase().split(/\W+/)) {
      // Stopwords are excluded explicitly. Without this, "What Pockit's terms mean"
      // matched "what is the capital of France" on the word "what", and Pock
      // answered a geography question with a glossary of budgeting terms.
      if (word.length > 3 && !TITLE_STOPWORDS.has(word) && text.includes(word)) score += 1;
    }
    return { entry, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/** Rendered for the model. Only the entries chosen, never the whole corpus. */
export function renderHelp(entries: HelpEntry[]): string {
  if (entries.length === 0) return '';
  return [
    'HOW POCKIT WORKS (accurate as of this build — prefer this over any assumption about how finance apps usually work):',
    ...entries.map((e) => `\n## ${e.title}  [${e.route}]\n${e.body}`),
  ].join('\n');
}

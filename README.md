# Pockit

A personal and small-business financial operating system. Not a budgeting
calculator — a ledger you can trust, an analysis engine that computes every figure
in exactly one place, and (in progress) an ingestion pipeline that turns screenshots,
statements and spreadsheets into structured transactions.

## Where the design lives

| Document | What it covers |
|---|---|
| [docs/01-analysis.md](docs/01-analysis.md) | Spec analysis: problems found, security concerns, AI limitations, what to postpone, and **gaps the spec was missing** |
| [docs/02-architecture.md](docs/02-architecture.md) | Stack decisions and the reasoning against the alternatives, AI provider strategy, the ingestion pipeline, and why video is processed in the browser |
| [docs/03-schema.md](docs/03-schema.md) | Entities, ledger semantics, and the integrity rules enforced in Postgres |
| [docs/04-sitemap-flows.md](docs/04-sitemap-flows.md) | Sitemap and the user flows for each major task |
| [docs/05-roadmap.md](docs/05-roadmap.md) | Milestones, each leaving the repo deployable |
| [docs/06-design-system.md](docs/06-design-system.md) | Tokens, typography, components, mobile and dark mode |

## Navigation

Related views are tabs inside one destination rather than separate nav entries:
`Accounts & debts` holds Balances and Debts & payoff, `Insights` holds Patterns and
Forecast. Each keeps its own route, its own data fetch and its own streaming
boundary — they simply read as one place. Splitting them had made the app look
wider and thinner than it is, and gave four related questions four half-empty
screens.

## The three rules that matter most

**1. Money is never a float.** Every monetary value is a `bigint` count of minor
units. `parseFloat` is banned by lint rule. `lib/money` owns all parsing, formatting,
allocation and currency conversion, and conversion never destroys the original
amount, currency or rate.

**2. There is one "where do I stand" calculation.** `lib/finance/position.ts` owns it:

```
posted      money that has actually moved (date <= today)
scheduled   money committed but not yet moved

availableNow = cash in hand − committed but not yet paid
```

Before it existed, a transaction dated next month counted as already spent, so a
planned bill vanished from the balance and inflated the spending total. Every screen
now derives its available figure from this one function.

**3. There is one finance engine.** `lib/finance` is pure — no I/O, no database
imports — and every page, chart, budget and export calls into it. This is what
prevents the failure mode where the dashboard and the transactions page disagree
about how much you spent.

The ledger rules it enforces:

| Type | Counts as spending? | Why |
|---|---|---|
| `expense` | yes | |
| `refund` | yes, negatively | so spending nets down against the purchase |
| `transfer` | **no** | both legs net to zero; counting one invents money |
| `debt_payment` | **no** | the purchase it repays was already counted |
| `investment` | no | invested money is still yours |

A credit card is modelled as a `credit`-normal account, so a card payment reduces
both the chequing balance and the debt without ever double-counting the purchase.

## Running locally

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate             # applies drizzle/*.sql, once each
npm run dev
```

Then create an account and choose **Load demo data** to get six months of realistic
finances — income, groceries, fuel, subscriptions with a mid-period price rise,
refunds, transfers, card payments, investments and business expenses.

## Quality gate

```bash
npm run verify   # lint + typecheck + unit tests + production build
```

Unit tests alone were not enough — they missed every bug that actually broke the
running app. So there is also an end-to-end smoke test that drives a real browser
against a real Postgres:

```bash
npm run db:start                    # local Postgres on :5433
npm run db:migrate
npm run build && npm start
BASE=http://localhost:3000 npm run e2e
```

It registers a new account, loads demo data, opens all fifteen pages, runs a CSV
import through extraction, duplicate detection, commit and rollback, and checks the
export — 30 assertions.

A second suite covers the *first-run* path, which needs a database with no Pockit
tables in it, so it cannot share the one above:

```bash
createdb pockit_setup
DATABASE_URL=postgres://.../pockit_setup ADMIN_SECRET=... npm start
BASE=http://localhost:3000 ADMIN_SECRET=... npm run e2e:setup
```

It asserts that an un-migrated deployment explains itself and offers the fix rather
than answering with a digest hash, that a wrong setup key is refused in words, and
that the app works once setup has run — 15 assertions. Run it a second time with
`MODE=outdated` against a database migrated to an *earlier* release.

A third suite covers the interface itself — the things unit tests cannot see:

```bash
BASE=http://localhost:3000 npm run e2e:ui
```

It checks that the headline figure is explained rather than left bare, that
"still to pay" and "coming up" never share a label across their two different time
windows, that the search and filter pills actually narrow the list, that the
quick-add sheet opens from the floating button and closes on Escape, that all
thirteen pages still render, and that nothing pushes the page sideways at 390px —
31 assertions.

A fifth suite (`npm run e2e:onboarding`, 13 assertions) signs up twice with
different answers and asserts the walkthrough genuinely diverges — different
wording, different seeded goal, different recommended first action.

A fourth suite walks the budget wizard's branches (`npm run e2e:wizard`, 13
assertions), asserting that different goals genuinely ask different questions — the
one thing a snapshot cannot catch, and exactly how the wizard went wrong before.

Financial logic carries the test coverage, not the cosmetics. The suite asserts the
cases the ledger must never get wrong: transfers excluded, card payments not
double-counted, refunds offsetting, splits totalling exactly, currency conversion
preserving originals, and category rollups not double counting.

It also pins the bugs that reached working code:

- A transaction dated next month was counted as already spent, so planned bills
  disappeared from the balance and could not be found again.
- Both legs of a transfer were shown as separate upcoming bills and as duplicated
  recent activity.

- Two identical $5.25 coffees 19 days apart once scored 75 — "likely duplicate" —
  because a distant date contributed no points but never *penalised*. The date is now
  a gate, as the amount already was.
- The production build once required `DATABASE_URL`, because the database client
  connected at module scope and `next build` imports every route to collect page
  data. The client is now lazy, and blank environment variables fall back to their
  defaults rather than failing validation.
- `formatMoney` crashed on any compact figure over $1,000 with cents, because
  `minimumFractionDigits` exceeded `maximumFractionDigits` and `Intl` throws on that.
  Empty accounts never reached it, so the dashboard only 500'd once there was real
  data in it.
- Both legs of a transfer were counted separately, listing "Transfer to savings" and
  "Transfer from chequing" as two upcoming bills and double-counting investment
  contributions in the forecast. `isExternalCashMovement` now answers that question
  in one place for the forecast, the calendar and the overview.
- The migration runner filtered comment-only chunks with a regex whose nested
  quantifier backtracked catastrophically on a chunk starting with comments — exactly
  how the triggers-and-RLS migration begins. It never errored; it hung, so a migrated
  database ended up with tables but **no row-level security and no triggers**. The
  filter is now a linear line scan.
- A deployment whose database had never been migrated answered every page with
  "Application error: a server-side exception has occurred" and a digest hash. There
  was no error boundary and no path from that screen to the fix. `/setup` now
  diagnoses the deployment and can run the migration itself, and the sign-up action
  no longer turns an infrastructure failure into a stack trace.
- Readiness asked only whether *any* migration had run, so a database migrated
  before a later release was reported healthy while every page touching a new
  column threw — and `/setup`, believing the app fine, redirected the owner
  straight back to the broken page. A partially migrated database is a broken one:
  the diagnosis now compares what the database has applied against the migrations
  the build actually ships.
- The migration `.sql` files were read from `process.cwd()` at runtime and were not
  in the deployed bundle at all, because Next cannot trace a dynamic `readdir`.
  `outputFileTracingIncludes` now ships them, and the directory is resolved against
  several candidate roots rather than one guess.
- The setup key was compared byte-for-byte, so a value copied out of a hosting
  dashboard with a trailing newline — or saved as `KEY="value"` with the quotes
  included — was rejected as wrong with no hint why. Both sides are now normalised
  identically before the constant-time comparison, and the rejection message names
  the two causes that are far more common than a typo: quotes, and changing the
  variable without redeploying.
- A variable that existed but held an empty value reported as "DATABASE_URL is
  required", which sent someone hunting for a variable they could plainly see
  listed in their dashboard. Absent, blank and present-but-invalid are three
  different problems and now read as three different messages. Only the length of
  a value is ever reported, never any part of it.

## Deployment

The app targets Vercel with any Postgres. See **Environment** below, then after the
first deploy apply the schema once. The simplest way is to open `/setup` on the
deployed app and enter the `ADMIN_SECRET`; it reports what is missing and runs the
migration in place. The same thing over the wire:

```bash
curl -X POST https://<your-app>.vercel.app/api/admin/migrate \
  -H "x-admin-secret: $ADMIN_SECRET"
```

`GET /api/health` reports database reachability, which migrations have run, the
storage driver and whether a vision-capable AI provider is configured.

## Environment

See [.env.example](.env.example). Only `DATABASE_URL` and `AUTH_SECRET` are
required. Without an AI key the app falls back to the `heuristic` provider, which
genuinely parses CSV, Excel and text PDFs and categorises from the merchant lexicon
plus your own rules — images and video frames are what need a vision model.

## Security posture

- Passwords: scrypt (N=2^16), in Node's standard library so there is no native
  module to ship to a serverless runtime.
- Sessions: HMAC-signed httpOnly cookies; only a SHA-256 hash of the token is stored,
  so a database leak yields nothing usable.
- Isolation: every query goes through a workspace-scoped repository **and** Postgres
  RLS, which denies by default when no user is bound to the connection.
- Integrity: database triggers enforce that a transaction's workspace matches its
  account's, that transactions attach only to leaf categories, and that splits sum
  exactly to their parent.
- Sign-in is timing-equalised so response time cannot reveal which emails are
  registered; rate limiting lives in Postgres because serverless functions share no
  memory.
- Bank credentials are never requested or stored, and no bank site is ever scraped.

## Status

**Built, tested and verified** (lint + typecheck + 156 unit tests + 102 end-to-end checks + production build green):

| Area | State |
|---|---|
| Money layer | Integer minor units, FX preserving originals, exact split allocation |
| Finance engine | Ledger, budgets (6 methods), goals + feasibility, forecast, safe-to-spend, recurring detection, duplicate scoring, debt payoff, net worth, patterns, insights, scenarios |
| Schema | 47 tables, integrity triggers, RLS |
| Auth | scrypt, signed httpOnly sessions, rate limiting, audit log, workspace isolation |
| Screens | Overview, Transactions, Budget, Goals, Calendar at the top level; Recurring, Accounts, Import, Analytics, Forecast, Debts, Business, Assistant, Settings behind "More" |
| Guidance | Guided budget setup, plain-language figures with explanations and actions, goal pace analysis, empty states that offer a next step |
| Privacy & export | File-retention choice, AI on/off, AI disclosure, learned-rule management, CSV export of transactions, summaries, goals and categories |
| Import pipeline | CSV, Excel, text PDF and image, staged for review with duplicate scoring, commit and rollback |
| AI | Provider abstraction; the heuristic driver works with no API key; the Anthropic driver adds vision and the grounded assistant |

**Not built yet:**

- Invoices, customers and vendors. The schema exists and the Business screen reports
  revenue, expenses, profit and margin from classified transactions, but there is no
  invoicing UI yet.
- Notification delivery. Rules are seeded at sign-up but nothing sends them.
- Excel and PDF export. CSV export is built for all four datasets.
- Screen-recording import. The client-side keyframe architecture is specified in
  [docs/02-architecture.md §2.6](docs/02-architecture.md) but not implemented.
- Scenario planning and paycheck allocation screens. Both engines are built and tested.

See [docs/05-roadmap.md](docs/05-roadmap.md).

## Known limitations

- **Bank connections are deliberately absent.** Manual entry and file import are the
  intended path; `accounts.external_provider` is the seam for adding a provider later
  without touching the transaction system. No bank site is scraped, and no bank
  password is ever requested.
- **Images need an AI key.** CSV, Excel and text PDFs are parsed on the server with no
  provider involved. Screenshots and scanned PDFs require `ANTHROPIC_API_KEY`.
- **Investment values are manual.** There is no price feed;
  `holdings.current_value_minor` is a stored figure, with a `PriceProvider` seam for
  adding one later.
- **Serverless upload limit.** Vercel caps request bodies at around 4.5 MB, so
  `MAX_UPLOAD_MB` should be kept under the platform limit in production.

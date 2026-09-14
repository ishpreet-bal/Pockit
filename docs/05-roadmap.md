# STEP 5 — Implementation Roadmap

Every milestone leaves the repository in a **working, deployable state** (build + typecheck + lint +
tests green). Milestones are sized to be independently reviewable.

| # | Milestone | Leaves the repo able to… | Status |
|---|---|---|---|
| M1 | Scaffold: Next 15, TS strict, Tailwind v4, Vitest, Drizzle, env validation, design tokens | Build and serve a themed shell | ✅ |
| M2 | Schema + migrations in `pockit` schema; RLS; triggers; seeded system categories | Store the full domain | ✅ |
| M3 | `lib/money` + `lib/finance` pure engine with tests | Compute every figure correctly | ✅ |
| M4 | Auth, sessions, workspaces, isolation guard, audit log, rate limiting | Sign up, sign in, be isolated | ✅ |
| M5 | UI primitives, app shell, Command Centre, date filtering, widget config | Show a real dashboard | ✅ |
| M6 | Transactions CRUD, splits, bulk edit, search, categories, accounts, transfers | Be a usable ledger | ✅ |
| M7 | Budgets (6 methods), tracking, goals, feasibility, scenarios, paycheck planning | Plan money | ✅ |
| M8 | Import pipeline: CSV/XLSX/PDF/image + review queue + dedupe + rollback + video keyframes | Ingest files | ✅ |
| M9 | AI providers, assistant with tools, NL search, insights, monthly review, rule learning | Answer questions from records | ✅ |
| M10 | Business workspace, invoices, customers, vendors, receipts, mileage | Run a side business | ✅ |
| M11 | Net worth, investments, debts + payoff sim, calendar, forecast/safe-to-spend UI, notifications | See the whole position | ✅ |
| M12 | Onboarding, demo data, export, settings, privacy controls | Be adopted by a new user | ✅ |
| M13 | Quality gate: lint, typecheck, tests, build, responsive review | Ship with confidence | ✅ |
| M14 | Vercel deployment + env wiring + live verification | Be used daily | ✅ |

## Mapping to the spec's own phases

- **Phase 1 (Foundation)** = M1–M7
- **Phase 2 (Import)** = M8
- **Phase 3 (AI)** = M9
- **Phase 4 (Advanced automation)** = M11 + the recurring/forecast parts of M3
- **Phase 5 (Business)** = M10
- **Phase 6 (Expansion)** = deliberately **not** implemented; seams are in place
  (`accounts.external_provider`, `PriceProvider`, `StorageDriver`, `AiProvider`, `job_runs`).

## Deferred, with the seam already built

| Deferred | Seam that makes it a drop-in later |
|---|---|
| Bank / open-banking sync | `accounts.external_provider` + `external_id`; the import pipeline's candidate/dedupe stage is provider-agnostic |
| Live market prices | `PriceProvider` interface; `holdings.current_value_minor` is just a cache |
| Background queue | `job_runs` table; cron routes already idempotent |
| Billing / tiers | `workspaces.owner_user_id`, `ai_extractions` cost rows, `audit_logs` |
| Native mobile | `lib/finance` is pure and portable; extract to a package when needed |

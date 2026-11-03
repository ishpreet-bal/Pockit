# Local development and code map

This guide describes the checked-in implementation. The numbered design documents
describe the original plan; their completion claims and deferred-feature lists are
not always current.

## Architecture

There are two independent npm projects, each with its own lockfile:

| Location | Purpose |
| --- | --- |
| Repository root | Next.js 15 / React 19 website, API, server actions; TypeScript 5.9 |
| `mobile/` | Expo 57 / React Native 0.86 app for iOS, Android, web; TypeScript 6 |
| `public/app/` | Committed mobile web export, served at `/app` |
| `public/preview.html` | Phone-frame preview, served at `/preview` |

After changing mobile screens, run `npm run build:app-web` from the root to
refresh the committed `/app` and `/preview` bundle. This works on Windows and
keeps requests on the serving site's backend instead of embedding a local URL.

The mobile app has its own UI, not its own database or finance engine. Its API
client sends a Bearer session token, stored with Expo SecureStore on native or
session storage on web. The website uses an httpOnly cookie. Both use the same
server-side sessions.

```text
Web page / mobile API request
  -> authentication + active workspace
  -> WorkspaceRepo / withUser transaction
  -> PostgreSQL rows mapped to domain types
  -> lib/finance pure calculations
  -> rendered page / JSON response
```

`WorkspaceRepo` applies workspace filters. `withUser` binds the current user
within each transaction and switches to `pockit_app` when available, so PostgreSQL
row-level security also enforces membership. The SQL migrations install tables,
policies, and integrity triggers.

| Area | Entry points |
| --- | --- |
| Money parsing, formatting, FX, allocation | `src/lib/money/index.ts` |
| Spending, income, balances, transfers | `src/lib/finance/ledger.ts` |
| Cash available after commitments | `src/lib/finance/position.ts` |
| Shared dashboard aggregation | `src/lib/finance/view/overview.ts` |
| Mobile dashboard response | `src/app/api/mobile/summary/route.ts` |
| Schema and scoped queries | `src/lib/db/schema.ts`, `src/lib/data/repository.ts` |
| Passwords, sessions, TOTP | `src/lib/auth/` |
| Import parsing, review, commit, rollback | `src/lib/import/` |
| AI provider drivers | `src/lib/ai/` |
| Pock instructions, app knowledge, user context | `src/lib/pock/`, `src/app/api/pock/route.ts` |
| Quotes, search, history, sample data | `src/lib/market/` |
| Plaid accounts and transaction sync | `src/lib/bank/` |
| Shared spaces and expense repayments | `mobile/lib/spaces.ts`, `src/lib/data/cost-shares.ts` |
| Subscription access and webhook | `src/lib/billing/plan.ts`, `src/app/api/mobile/revenuecat/route.ts` |
| Mobile screens, data, theme | `mobile/app/`, `mobile/lib/`, `mobile/theme/` |

Money in the domain engine is bigint minor units. Transfers and debt repayments
do not count as spending; refunds reduce spending. Future transactions remain
commitments until their date. Put new calculations in the finance engine so web
and mobile share the result. The mobile JSON boundary converts amounts to numeric
minor units because JSON cannot represent bigint.

Imports hash and parse files, normalize fields, categorize merchants, and score
duplicates. Proposed rows stay in `import_candidates` until explicitly accepted
and committed. Transactions retain their import ID for rollback.

## Local setup (PowerShell)

Requirements: Node 20+, npm, and Docker Desktop for the local database. Run from
the repository root (the inner `Pockit` directory).

```powershell
npm.cmd ci
Push-Location mobile
npm.cmd ci
Pop-Location
```

Use the ignored `.env.local` and `mobile/.env` prepared during initial setup.
For a fresh checkout, copy the example files, generate separate random values for
`AUTH_SECRET`, `ADMIN_SECRET`, and `POCKIT_DB_PASSWORD`, and set:

```dotenv
# .env.local: use the same generated password in both values
POCKIT_DB_PASSWORD=<local-password>
DATABASE_URL=postgres://pockit:<local-password>@127.0.0.1:5433/pockit
APP_URL=http://localhost:3000
```

Start Docker Desktop, then:

```powershell
docker compose --env-file .env.local up -d --wait
npm.cmd run db:migrate
npm.cmd run dev
```

Open `http://localhost:3000`. Sign up and load demo data through the UI.
`db:seed-demo` currently points to a missing script; use the UI instead.
The older `npm run db:start` script requires a Linux PostgreSQL installation.
Compose provides the Windows alternative, listening only on loopback port 5433.
Stop it with `docker compose --env-file .env.local stop`.

In another terminal:

```powershell
cd mobile
npm.cmd run web
```

`mobile/.env` should use `EXPO_PUBLIC_API_URL=http://localhost:3000` and
`EXPO_PUBLIC_PREVIEW=0`. Set preview to `1` and restart Expo to review the UI
without a backend. A physical phone needs the computer's LAN IP instead of
localhost. Native iOS builds use EAS; Windows cannot run the iOS simulator.
The EAS preview/production profiles currently target the deployed backend, so
check those URLs before building for local testing.

## Verification

```powershell
npm.cmd run verify
Push-Location mobile
.\node_modules\.bin\tsc.cmd --noEmit
Pop-Location
```

Root verification runs lint, typecheck, unit tests, and a production build. It
excludes mobile. The bank integration test is opt-in with `DB_IT`, `IT_USER`,
and `IT_WORKSPACE`.

Browser tests need a running server, migrated database, and Playwright Chromium:

```powershell
.\node_modules\.bin\playwright.cmd install chromium
npm.cmd run e2e
```

Setup tests need a separate empty database. See the README for each browser suite
and its fixture requirements.

Stop a running Next.js development server before running the production build;
both currently write to `.next`. Run `npm run e2e:polish` against a started server
for the integration and search regressions added in the finishing pass. See
[Integrations](INTEGRATIONS.md) for the current key inventory and audit results.

## Optional services and documentation gaps

Basic ledger work needs only PostgreSQL and `AUTH_SECRET`. Anthropic or OpenAI
enables chat and vision extraction. Structured imports work without keys using
the heuristic provider. Market data uses labeled samples without a provider key.
Plaid, Resend, RevenueCat, and Google Maps have optional environment settings.
Plus is disabled by default.

The original docs defer mobile, bank sync, billing, and live market feeds, but
all now have implementations. Roadmap completion marks do not prove every
planned flow exists: video keyframe extraction and invoicing UI are still listed
as unfinished in the README. `vercel.json` has no scheduled cron jobs. Storage
implements PostgreSQL and Supabase; the declared Vercel Blob option currently
falls back to PostgreSQL.

## Initial setup verification — October 28, 2026

- Installed both lockfiles with `npm ci`, without changing dependency versions.
- Created ignored local environment files with generated auth, admin, and database secrets.
- Started PostgreSQL 16 through Compose and applied all 14 migrations (0000–0013).
- Web lint and TypeScript checks passed; mobile TypeScript check passed separately.
- Unit tests: 310 passed; the opt-in bank integration test was skipped.
- Production build passed; `/api/health` reported `ready` with no pending migrations.
- Installed Playwright Chromium; the existing browser smoke suite passed 30/30 checks.

In the Codex Windows sandbox, `tsx` user lookup and Vite configuration loading
needed an unsandboxed retry. Dependency/browser downloads and the Next.js build's
Google Fonts download also required external access. These were environment
restrictions, not application test failures. Native device builds, other browser
suites, and integrations requiring third-party keys were not exercised.

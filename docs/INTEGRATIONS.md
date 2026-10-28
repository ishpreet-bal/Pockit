# Which keys Pockit needs

Audit date: October 28, 2026. This maps the checked-in code, not just the example
env file. Credentials are configured separately for local development, Vercel,
and EAS; a local configuration does not establish what is set in deployments.

Run `npm run config:check` from the repository root for a secret-free local
inventory. It checks presence only, makes no provider calls, and does not print
values. A configured key can still be expired, unfunded, or lack feature access.

## Keys for the implemented features

| Feature | Variables | What else is necessary | Where used |
| --- | --- | --- | --- |
| Pock chat, learning tutor, receipt photos, screenshot extraction, written asset analysis | **Either** `OPENAI_API_KEY` **or** `ANTHROPIC_API_KEY`; `AI_PROVIDER=auto` or the matching provider | API access and available quota for the configured model; an API key from the provider console | `src/lib/ai/`, `src/app/api/pock/`, `src/app/api/mobile/receipt/route.ts` |
| Real market quotes, historical charts, provider-wide symbol search | `TWELVEDATA_API_KEY` | Account access to the requested instruments/endpoints and sufficient API credits | `src/lib/market/twelvedata.ts` |
| Password-reset email | `RESEND_API_KEY`, `EMAIL_FROM`, correct public `APP_URL` | Verify a sending domain in Resend; `EMAIL_FROM` must use it, and `APP_URL` must lead to this deployment's `/reset-password` | `src/lib/email.ts`, `src/lib/auth/password-reset.ts` |
| Real bank connections and transaction sync | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=production` | Production product access and the appropriate Link/OAuth setup in Plaid; Sandbox is for test banks | `src/lib/bank/`, `src/app/api/mobile/bank/` |
| Google-backed trip place search and driving directions | `GOOGLE_MAPS_API_KEY` | Enable **Places API (New)** and **Routes API**, attach billing, and permit those APIs on the server-side key | `src/lib/trip/routing.ts` |
| Paid iOS Pockit Plus subscriptions | Server: `REVENUECAT_WEBHOOK_SECRET`, `PLUS_ENABLED=true`; app: `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | App Store products, RevenueCat entitlement/offering, store credentials, and webhook configuration described below | `src/lib/billing/plan.ts`, `src/app/api/mobile/revenuecat/route.ts`, `mobile/lib/purchases.ts` |

The first four rows are what turn the main external features into working live
features. Google is optional: trip search/routing already falls back to Photon
and OSRM without a key. Plus is also optional: while disabled, there is no paywall
and everyone has unrestricted access to Pock.

### AI: choose one provider

You do not need both AI keys. With `AI_PROVIDER=auto`, Anthropic takes precedence
if both exist. Explicit `AI_PROVIDER=openai` selects OpenAI; explicitly selecting a
provider without its key falls back to the heuristic driver even if the other
provider's key exists.

`OPENAI_MODEL` and `AI_MODEL` are optional model overrides, not keys. Leave them
blank to keep the project's defaults, and ensure the selected provider account
can use that model. A chat subscription is not itself the `*_API_KEY` consumed by
this server. Both provider keys stay server-side; never add them to an
`EXPO_PUBLIC_*` variable.

Official setup: [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication)
and [Claude API prerequisites](https://platform.claude.com/docs/en/api/overview).
Once configured, sign in and use the app's Pock provider check, or make an
authenticated request to `/api/pock/health`. That endpoint makes a small real
model call, so use it deliberately.

### Market data: a second key is not an automatic upgrade

`FINNHUB_API_KEY` is an alternative, not an additional requirement. When a Twelve
Data key exists, Finnhub is not selected at all. Providers are not combined.
History availability and instrument coverage depend on the provider account.
See [Twelve Data request authentication](https://support.twelvedata.com/en/articles/5620512-how-to-create-a-request)
and [API credits](https://support.twelvedata.com/en/articles/5615854-credits).

The current Twelve Data adapter explicitly returns no fundamentals or news.
Purchasing a larger plan or adding Finnhub alongside Twelve Data will not wire
those sections up. That requires an adapter change. Without either market key,
the app uses labeled simulated prices. Settings → Market data (or authenticated
`/api/market/health`) probes quotes and history against the selected source.

### Email: a key alone does not enable delivery

Create a sending key and verify your domain through Resend's DNS instructions.
Set `EMAIL_FROM` to a sender on that domain and `APP_URL` to the actual public
origin. `SUPPORT_EMAIL` supplies the contact on Privacy/Terms; it is not a key and
does not configure mail delivery. See [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction)
and [verified domains](https://resend.com/docs/dashboard/domains/introduction).

### Banks: sandbox and production are different

Use the secret for the selected Plaid environment. Sandbox can test the flow but
cannot connect someone's actual bank. The integration requests the Transactions
product and uses Hosted Link; finish the provider's production/Link setup, then
test the return-to-app flow on a real device. Per-user Link/public/access tokens
are generated during linking; they are not additional env variables to collect.
See [Plaid API access and environments](https://plaid.com/docs/api/)
and [Hosted Link](https://plaid.com/docs/link/hosted-link/).

### Subscriptions: enable only after configuring the store

- Create `pockit_plus_monthly` and `pockit_plus_yearly` in App Store Connect.
- Connect the iOS app in RevenueCat, create entitlement `plus`, and put the products
  into the `default` offering's Monthly/Annual packages.
- Put the **public iOS SDK key** in `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. A RevenueCat
  secret REST API key is not used by this code and must not go in the app.
- Configure `https://<public-origin>/api/mobile/revenuecat` as the webhook URL.
  Set its Authorization value to the same random value as
  `REVENUECAT_WEBHOOK_SECRET` (the endpoint also accepts a `Bearer` prefix).
- Test purchases and restore in a store-enabled iOS build, verify the server's
  plan changes, then enable `PLUS_ENABLED=true`. Rebuild the app when public Expo
  environment values change.

See [RevenueCat API key types](https://www.revenuecat.com/docs/projects/authentication)
and [webhook authorization](https://www.revenuecat.com/docs/integrations/webhooks).
The purchase adapter is currently iOS-only; an Android SDK key alone does not add
Android subscriptions. See also [Pockit Plus](pockit-plus.md).

The native trip map uses Apple Maps on iPhone and needs no Apple Maps key.
An Android map build also needs the platform-specific native Maps SDK setup;
the server's `GOOGLE_MAPS_API_KEY` is not automatically embedded in that build.

## Required configuration that is not a third-party API key

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; required for stored data |
| `AUTH_SECRET` | Random secret of at least 32 characters; signs sessions and derives encryption keys for TOTP and Plaid tokens |
| `ADMIN_SECRET` | Random setup/migration key; enables the protected setup endpoint |
| `APP_URL` | Public website origin, especially for password-reset links |
| `EXPO_PUBLIC_API_URL` | Backend URL embedded in mobile builds; use the computer's LAN IP for physical-phone local testing |
| `ADMIN_EMAILS` | Optional admin email allowlist; enables developer access and unlimited Plus |
| `SUPPORT_EMAIL` | Public contact shown in legal pages |

Keep existing production `AUTH_SECRET` stable: changing it invalidates sessions
and changes the key used for existing encrypted second factors/bank tokens. Use
separate generated secrets for development and production.

## Optional or currently unused settings

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`: only necessary
  with `STORAGE_DRIVER=supabase`. PostgreSQL file storage is already implemented
  and needs no separate storage key, even if PostgreSQL itself is hosted by Supabase.
- `BLOB_READ_WRITE_TOKEN`: currently unused. The declared `vercel_blob` driver
  falls back to PostgreSQL; adding this token does not implement Blob storage.
- `CRON_SECRET`: no current cron routes are shipped and `vercel.json` has no cron
  schedule. Adding a secret does not create recurring background jobs.
- `TWELVEDATA_CREDITS_PER_MINUTE`: optional capacity setting, not a key; defaults
  to 8 in the adapter. Match your account allowance if changing it.

## What keys do not finish

Scanned PDF rasterization, video keyframe import, invoice/customer/vendor UI,
email verification at signup, and web-to-mobile feature parity require code.
Scanned PDFs now return an actionable error; clear page images can use the
existing vision pipeline. Feedback is stored but not emailed. The Twelve Data
news/fundamentals sections need implementation, as noted above. These are
separate work items, not hidden missing credentials.

For deployment, put server variables in the appropriate Vercel environment and
redeploy; use EAS/build environment settings for the app's public variables.
The local `.env` files are not automatically copied to either service. Validate
each configured feature end to end; `/api/health` being `ready` proves core
database readiness, not that every external service works.

## Small fixes made during this audit

- Allowed the mobile preview's workspace header through localhost CORS.
- Prevented stale investment/merchant suggestions from reappearing after clearing
  an input; added unique popup IDs and active-option accessibility information.
- Made Escape dismiss transaction suggestions before closing the transaction sheet.
- Allowed typing letter-based recovery codes on the mobile sign-in screen.
- Added current account balances/currencies to the mobile Accounts screen using
  the existing ledger and money formatter; reloaded them after balance changes.
- Stopped failed bank syncs from being labeled successful.
- Used the user's timezone for default transaction months and balance dates;
  invalid month parameters now fall back without reaching PostgreSQL as bad dates.
- Replaced scanned/unreadable PDF server failures with actionable 422 responses,
  and corrected text claiming scanned PDF support.
- Made the UI browser suite create a demo fixture when no test login is supplied.

Validation: 323 unit tests passed (one opt-in bank integration test skipped), web
lint/types and mobile types passed, the production build and Expo web export
succeeded, the focused regression browser suite passed 14/14, and the existing UI
suite and original smoke suite (30/30) passed. The mobile Accounts screen was
checked at 390px without horizontal overflow or client exceptions. Full live
provider flows and native device/store builds were not validated.

The committed `/app` browser bundle was regenerated as well. A portable
`npm run build:app-web` command now builds it with a same-origin API URL and
tracked package assets, preventing a Windows export from embedding the local
development backend. The existing Bash entry point delegates to that command's
Node implementation.

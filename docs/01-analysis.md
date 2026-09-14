# STEP 1 — Specification Analysis

## 1.1 What this product actually is

Stripped to its core, the spec describes **three** products that share one ledger:

1. **A ledger** — correct, auditable, multi-currency, double-entry-ish transaction storage.
2. **An analysis engine** — deterministic math over that ledger (budgets, goals, forecasts, net worth, safe-to-spend, insights).
3. **An ingestion engine** — messy input (images, PDFs, CSVs, video) → validated ledger rows.

Everything else in the 53-section spec is a view onto one of those three. The single most important
architectural consequence: **the analysis engine must never be reimplemented per page**, and **the
ingestion engine must never write to the ledger without passing through validation + review**.

## 1.2 Core requirements (non-negotiable)

| # | Requirement | Why it is load-bearing |
|---|---|---|
| R1 | Money stored as integer minor units | Float arithmetic silently corrupts financial records. `0.1 + 0.2 !== 0.3`. |
| R2 | One canonical finance engine | §44 "Calculating critical values differently across pages" is the #1 source of user distrust in finance apps. |
| R3 | Transfers / CC payments excluded from spend | §27, §43. Getting this wrong makes every number on the dashboard wrong. |
| R4 | Workspace isolation is enforced server-side | §29, §49. A cross-workspace leak is a total product failure. |
| R5 | AI never writes to the ledger unreviewed | §45. AI output is a *proposal*, not a record. |
| R6 | Full provenance on every imported row | §45. Without it, debugging bad extraction is impossible. |
| R7 | Import rollback | §26. The safety net that makes users willing to try bulk import at all. |
| R8 | Original currency preserved | §28. Conversion is a derived view, never a destructive write. |

## 1.3 Problems in the spec as written

**P1 — "Safe to Spend" is defined circularly.**
§14 subtracts "expected essential spending" from available cash, but §13 also forecasts variable
spending. Naively applying both double-counts. *Resolution:* one forecast model; safe-to-spend is a
**projection of that model** to a horizon, not a second independent calculation. Implemented in
`lib/finance/safe-to-spend.ts` consuming `lib/finance/forecast.ts`.

**P2 — Credit cards break the naive "balance = sum of transactions" model.**
A credit card is a *liability* account whose balance grows with spending. A payment from chequing to
the card is a transfer that reduces the liability. If you model cards as normal accounts you either
double-count the expense (once at purchase, once at payment) or lose the debt. *Resolution:* accounts
carry a `normalBalance` of `debit` (asset) or `credit` (liability), and every transaction posts as a
signed delta against that. See `docs/03-schema.md §Ledger semantics`.

**P3 — "AI detects duplicates" is the wrong layer.**
Duplicate detection must be deterministic and explainable ("98% likely duplicate" needs a formula the
user can see), or users cannot trust a merge. *Resolution:* duplicate scoring is a **pure function**
with published weights. AI is not in this path at all.

**P4 — Screen recording processing is the highest-risk feature in the spec.**
Server-side video decode requires ffmpeg, which is not available on Vercel's serverless runtime,
exceeds function memory/time limits, and means uploading large private financial videos to a server.
*Resolution:* **extract frames in the browser** (`<video>` + `<canvas>` + perceptual hashing), dedupe
client-side, and upload only the surviving keyframes as images. The video never leaves the device.
This is both cheaper and materially more private. See `docs/02-architecture.md §Video`.

**P5 — Percentage/zero-based budgeting and category budgeting are different data shapes.**
Forcing them into one table produces a schema full of nullable columns. *Resolution:* one `budgets`
row carries a `method` discriminator plus a validated JSONB `rules` payload whose shape is enforced by
a Zod discriminated union at the application boundary. Allocations that *do* map to categories are
normalised into `budget_allocations`.

**P6 — "The AI should learn categorization preferences."**
Framed as learning, this invites a black box. *Resolution:* learning is a visible, editable
**`merchant_rules` table**. Correcting a transaction writes/updates a rule; the user can see and
delete every rule the system has inferred. Deterministic, auditable, reversible.

**P7 — Tax status.**
§17 asks for tax labels but §17 also says "Do not automatically make legal or tax conclusions."
*Resolution:* `taxRelevance` is a user-owned label with an explicit `reviewedByUser` boolean. The AI
may *suggest* but the field renders as unreviewed until a human confirms. No tax advice is generated.

## 1.4 Security concerns

- **Uploaded financial documents are the crown jewels.** They must never be publicly addressable.
  Storage is abstracted; the default driver keeps bytes in Postgres and serves them only through an
  authenticated, workspace-scoped route. No public bucket, no guessable URL.
- **Row-level isolation** must be enforced in two independent places: application-layer workspace
  scoping (every query goes through a scoped repository) *and* Postgres RLS. Either alone is one bug
  away from a leak.
- **AI providers receive the minimum.** The assistant sends *aggregates and query results*, never a
  full transaction dump. The extraction path sends the uploaded artifact only.
- **Never store bank credentials.** No scraping, no password fields. §42.
- **Secrets** live only in server-side env; the AI keys are never bundled. Any `NEXT_PUBLIC_*` var is
  treated as public by definition.
- **Rate limiting** on auth and on AI endpoints (cost control *and* abuse control).
- **Audit log** for auth events, imports, rollbacks, deletions, and workspace changes.

## 1.5 AI limitations to design around

1. **Vision OCR misreads digits.** `$72.18` vs `$12.18`. Mitigation: per-field confidence, review
   queue, and never auto-committing a row below the confidence floor.
2. **Models hallucinate plausible transactions.** Mitigation: strict Zod schema validation on the
   structured output, plus a rule that extracted rows must be traceable to a source region.
3. **Date ambiguity.** `09/10` is Sep 10 or Oct 9 depending on locale. Mitigation: an explicit
   `dateFormatHint` per import, cross-checked against the statement period when available.
4. **Costs scale with pixels.** Mitigation: client-side frame dedupe, image downscaling, and batching
   multiple frames per request.
5. **Non-determinism.** Same image, different answer. Mitigation: AI output is a *proposal row* in
   `import_candidates`, not a ledger row. Re-running an import produces a new candidate set, never a
   silent mutation.

## 1.6 Features that should be postponed

| Feature | Why postpone |
|---|---|
| Bank/open-banking integration (§42) | Requires a paid provider, legal agreements, and OAuth infrastructure. The account abstraction is built so this drops in later without touching the transaction system. |
| Real-time market data (§19) | Investment tracking is useful with manual values. Price feeds are a provider integration, kept behind a `PriceProvider` interface. |
| Native mobile app (§34) | A responsive PWA covers every listed mobile action. Native is only justified by camera/background-sync needs that a PWA already partly serves. |
| Multi-tenant billing/subscription tiers (§50) | Architected for (workspace ownership, usage counters, audit logs) but not implemented — it is pure overhead for a single user. |
| OCR without an AI provider | Bundling Tesseract into a serverless function is slow and large. Image ingestion requires an AI key; CSV/XLSX/text-PDF ingestion does not. |

## 1.7 Gaps in the spec — things that were missing

- **G1 — Opening balances.** You cannot compute net worth from transactions alone unless every
  account has a starting point. Added `accounts.openingBalanceMinor` + `openingBalanceDate`.
- **G2 — Balance reconciliation.** Real users import partial history. Added `account_balance_anchors`:
  a user-asserted "this account was $X on this date", so derived balances can be corrected without
  inventing fake transactions.
- **G3 — Refunds must link to the original purchase.** §43 requires refunds to offset spending; without
  a link, a refund in a later month distorts both months. Added `transactions.offsetsTransactionId`.
- **G4 — Category *rollup* vs *leaf* spending.** "Transportation" total must include children without
  double counting a transaction tagged to both. Enforced: transactions attach to **leaf** categories only.
- **G5 — Historical FX rates.** Converting a 2024 purchase at today's rate is wrong. Added `fx_rates`
  keyed by date, and the rate actually used is stored *on the transaction*.
- **G6 — Idempotency for imports.** A retried upload must not create a second import batch. Added a
  content hash on `uploaded_files`.
- **G7 — Soft delete + restore** for transactions, so rollback and user error are recoverable.
- **G8 — Timezone.** "This month" depends on the user's zone. Stored on the profile; all period math
  goes through one `period.ts` module. Transaction dates are stored as `date`, not `timestamptz`,
  because a purchase happened on a calendar day, not an instant.

## 1.8 Product improvements beyond the spec

- **Command-centre answers, not charts.** §46 is the right instinct; the Overview leads with five
  plain-language answers and puts charts underneath.
- **Every number is clickable.** Any figure on any screen drills through to the exact transactions
  that produced it. This is the single feature that converts a dashboard into something trustworthy.
- **Insight provenance.** Each insight stores the transaction IDs it was computed from (§36).
- **Review-queue keyboard flow.** Import review is the highest-volume interaction; it is built for
  keyboard (`j/k` move, `Enter` accept, `e` edit, `d` duplicate) so 100 rows take a minute.
- **Rules preview.** Before saving a merchant rule, show how many existing transactions it would change.

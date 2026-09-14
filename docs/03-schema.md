# STEP 3 — Database Schema

Schema namespace: **`pockit`**. All money is `bigint` **minor units** (cents). All tenant-owned tables
carry `workspace_id` and are protected by RLS.

## 3.1 Ledger semantics (the most important design decision)

An account has a **normal balance**:

- `debit` → assets (chequing, savings, cash, investment). Positive balance = you own it.
- `credit` → liabilities (credit card, loan, mortgage). Positive balance = you owe it.

A transaction carries a **signed `amount_minor` in the account's own direction**, plus a `type`:

| type | Effect on the account | Counts as spending? | Counts as income? |
|---|---|---|---|
| `expense` | decreases asset / increases liability | ✅ yes | no |
| `income` | increases asset | no | ✅ yes |
| `transfer` | paired rows, net zero across accounts | ❌ **no** | ❌ **no** |
| `refund` | increases asset / decreases liability | ✅ **negative spend** (offsets) | no |
| `investment` | moves value into a holding | no (it is saving) | no |
| `debt_payment` | transfer to a `credit` account | ❌ no (principal) | no |

**Why credit-card payments do not double count:** the purchase is an `expense` on the card
(liability up). The payment is a `transfer` from chequing to the card (asset down, liability down).
Only the `expense` is spending. The `transfer` is excluded by type, everywhere, by
`lib/finance/ledger.ts` — never by an ad-hoc filter in a page.

**Transfers** are stored as a pair of rows sharing a `transfer_group_id`, one per side. Either side
alone is never counted.

**Refunds** may set `offsets_transaction_id` to link back to the original purchase so that category
totals net out in the period the user chooses (`refund_attribution`: `original_period` | `refund_period`).

## 3.2 Entity map

```
users ─┬─< sessions
       ├─< user_profiles (1:1)
       └─< workspace_members >─ workspaces ─┬─< accounts ─┬─< transactions
                                            │             └─< account_balance_anchors
                                            ├─< categories (self-ref tree)
                                            ├─< budgets ─< budget_allocations
                                            ├─< goals ─< goal_contributions
                                            ├─< recurring_series ─< recurring_occurrences
                                            ├─< merchants ─< merchant_rules
                                            ├─< assets / liabilities / net_worth_snapshots
                                            ├─< holdings ─< holding_lots
                                            ├─< debts ─< debt_payments
                                            ├─< customers / vendors
                                            ├─< invoices ─< invoice_items
                                            ├─< uploaded_files ─< imports ─< import_candidates
                                            ├─< receipts ─< receipt_items
                                            ├─< ai_extractions
                                            ├─< insights / notifications / notification_rules
                                            ├─< saved_views
                                            └─< audit_logs

transactions ─< transaction_splits        (personal/business or category splits)
transactions ─< transaction_tags >─ tags
transactions ─1 receipts                  (attachment)
```

## 3.3 Tables

### Identity
- **`users`** — `id`, `email` (citext unique), `password_hash`, `email_verified_at`, `failed_login_count`, `locked_until`, timestamps.
- **`sessions`** — `id`, `user_id`, `token_hash` (never the token), `expires_at`, `ip`, `user_agent`, `revoked_at`.
- **`user_profiles`** — `user_id`, `display_name`, `base_currency`, `timezone`, `locale`, `theme`, `onboarding_completed_at`, `file_retention` (`delete_after_extract`|`keep`|`ask`), `ai_enabled`, `dashboard_widgets` (jsonb).

### Tenancy
- **`workspaces`** — `id`, `owner_user_id`, `name`, `kind` (`personal`|`business`), `base_currency`, `is_demo`, `archived_at`.
- **`workspace_members`** — `workspace_id`, `user_id`, `role` (`owner`|`admin`|`member`|`viewer`). Composite PK.

> §49 separation: a transaction's workspace is immutable after insert. Moving between workspaces is an
> explicit delete + create, audit-logged. "Combined Overview" is a *read-time union* across the user's
> workspaces, never a third workspace.

### Ledger
- **`accounts`** — `id`, `workspace_id`, `name`, `type` (`chequing`|`savings`|`cash`|`credit_card`|`line_of_credit`|`loan`|`mortgage`|`investment`|`business_chequing`|`other`), `normal_balance` (`debit`|`credit`), `currency`, `opening_balance_minor`, `opening_balance_date`, `institution`, `mask` (last 4 only — never a full number), `credit_limit_minor`, `interest_rate_bps`, `is_active`, `external_provider`/`external_id` (nullable — the seam for §42 bank feeds), `sort_order`.
- **`account_balance_anchors`** — user-asserted balance at a date, used to reconcile partial history.
- **`categories`** — `id`, `workspace_id`, `parent_id` (self-ref), `name`, `slug`, `kind` (`expense`|`income`|`transfer`|`investment`), `classification` (`fixed`|`variable`), `necessity` (`essential`|`discretionary`) — both user-editable per §48, `icon`, `color`, `is_system`, `is_archived`, `sort_order`. **Transactions attach to leaf categories only** (enforced by trigger) so rollups cannot double count.
- **`merchants`** — canonical merchant per workspace: `name`, `normalized_name`, `default_category_id`, `logo_hint`, `txn_count`.
- **`merchant_rules`** — `match_type` (`exact`|`contains`|`regex`), `pattern`, `category_id`, `business_classification`, `priority`, `source` (`user`|`learned`|`system`), `times_applied`, `last_applied_at`. **This table is the "AI learning" in §4 — visible and reversible.**
- **`transactions`** — the centre of the system:
  `id`, `workspace_id`, `account_id`, `posted_date` (date), `booked_at` (timestamptz, nullable),
  `description`, `original_description` (never overwritten), `merchant_id`, `merchant_name`,
  `amount_minor` (bigint, signed), `currency`, `base_amount_minor`, `base_currency`, `fx_rate` (numeric(18,8)), `fx_rate_date`,
  `type`, `category_id`, `payment_method`, `business_classification` (`personal`|`business`|`split`),
  `is_recurring`, `recurring_series_id`, `tax_relevance`, `tax_reviewed_by_user`,
  `transfer_group_id`, `offsets_transaction_id`, `refund_attribution`,
  `notes`, `source` (`manual`|`csv`|`xlsx`|`pdf`|`image`|`video`|`api`|`demo`), `import_id`,
  `ai_confidence` (0-100), `needs_review`, `receipt_id`,
  `created_by`, `deleted_at` (soft delete), timestamps.
- **`transaction_splits`** — `transaction_id`, `category_id`, `business_classification`, `amount_minor`, `percent_bps`, `note`. **Constraint: splits must sum exactly to the parent amount** (enforced by trigger, per §43).
- **`tags`**, **`transaction_tags`** — free-form labelling.

### Planning
- **`budgets`** — `id`, `workspace_id`, `name`, `method` (`category`|`percentage`|`zero_based`|`savings_first`|`fixed_variable`|`custom`), `period` (`weekly`|`biweekly`|`semimonthly`|`monthly`|`custom`), `period_start`, `period_days`, `rollover`, `rules` (jsonb, Zod-validated discriminated union), `is_active`.
- **`budget_allocations`** — `budget_id`, `category_id` (nullable for bucket-level), `bucket` (`needs`|`wants`|`savings`|null), `amount_minor`, `percent_bps`.
- **`budget_periods`** — materialised period instances with computed actuals, for fast history.

### Goals
- **`goals`** — `name`, `kind` (emergency_fund|vacation|car|house|tuition|investment|business_capital|debt_payoff|general|custom), `target_minor`, `current_minor`, `target_date`, `priority`, `account_id`, `monthly_contribution_minor`, `status`, `achieved_at`.
- **`goal_contributions`** — `goal_id`, `transaction_id` (nullable), `date`, `amount_minor`, `source` (`manual`|`auto`|`transaction_link`).

### Recurrence
- **`recurring_series`** — `merchant_name`, `category_id`, `account_id`, `amount_minor`, `amount_variance_bps`, `cadence` (`weekly`|`biweekly`|`semimonthly`|`monthly`|`quarterly`|`annual`|`custom`), `interval_days`, `next_expected_date`, `last_seen_date`, `kind` (`subscription`|`bill`|`income`|`transfer`|`other`), `detection_confidence`, `status` (`active`|`paused`|`cancelled`|`candidate`), `is_wanted` (§12 "subscriptions I no longer care about"), `price_history` (jsonb).
- **`recurring_occurrences`** — expected vs actual per date; drives the calendar and forecast.

### Position
- **`assets`**, **`liabilities`** — manual net-worth items with `value_minor`, `as_of`, `category`.
- **`net_worth_snapshots`** — daily/monthly `assets_minor`, `liabilities_minor`, `net_minor`, `breakdown` jsonb.
- **`holdings`** — `symbol`, `name`, `asset_class` (`stock`|`etf`|`crypto`|`managed`|`cash`|`other`), `account_id`, `quantity` (numeric(28,10)), `cost_basis_minor`, `current_value_minor`, `value_as_of`, `currency`.
- **`holding_lots`** — purchase lots for accurate cost basis.
- **`debts`** — `name`, `account_id`, `balance_minor`, `apr_bps`, `min_payment_minor`, `payment_day`, `target_payoff_date`, `strategy_order`.
- **`debt_payments`** — payment history with principal/interest split.

### Business
- **`customers`**, **`vendors`** — contact + terms.
- **`invoices`** — `number`, `customer_id`, `issue_date`, `due_date`, `status` (`draft`|`sent`|`partial`|`paid`|`overdue`|`void`), `subtotal_minor`, `tax_minor`, `total_minor`, `amount_paid_minor`, `currency`, `notes`.
- **`invoice_items`** — `description`, `quantity`, `unit_price_minor`, `tax_rate_bps`, `total_minor`.
- **`mileage_logs`** — `date`, `distance`, `unit`, `rate_minor`, `purpose`, `customer_id`.

### Ingestion
- **`uploaded_files`** — `filename`, `mime`, `size_bytes`, `content_hash` (idempotency), `storage_driver`, `storage_key`, `page_count`, `retention` , `deleted_at`.
- **`file_blobs`** — `file_id`, `bytes` (bytea) — used only by the `postgres` storage driver.
- **`imports`** — `file_id`, `source_kind`, `status` (`pending`|`extracting`|`review`|`committed`|`failed`|`rolled_back`), `candidate_count`, `imported_count`, `duplicate_count`, `error_count`, `error_detail`, `options` jsonb, `committed_at`, `rolled_back_at`.
- **`import_candidates`** — the **staging ledger**. Same shape as a transaction plus: `status` (`pending`|`accepted`|`rejected`|`duplicate`|`merged`), `duplicate_of_transaction_id`, `duplicate_score`, `duplicate_reasons` jsonb, `field_confidence` jsonb (per-field, drives §25 highlighting), `provenance` jsonb (`{page, frames:[118,143], bbox, sourceLine, rawText}`), `created_transaction_id`.
- **`ai_extractions`** — every model call: `provider`, `model`, `operation`, `input_tokens`, `output_tokens`, `latency_ms`, `cost_estimate_minor`, `status`, `error`. Cost + debugging (§50).
- **`receipts`**, **`receipt_items`** — merchant, date, subtotal, tax, total, currency, line items, `reimbursable`, `project`, `customer_id`.

### System
- **`fx_rates`** — `base`, `quote`, `rate`, `as_of` date, `source`. Historical, never overwritten.
- **`insights`** — `kind`, `period_start/end`, `headline`, `detail`, `severity`, `metrics` jsonb, `transaction_ids` (provenance, §36), `dismissed_at`.
- **`notification_rules`**, **`notifications`** — configurable alerts with dedupe keys so §35 "avoid excessive notifications" is enforced structurally.
- **`saved_views`** — persisted transaction filters.
- **`audit_logs`** — `actor_user_id`, `workspace_id`, `action`, `entity`, `entity_id`, `metadata`, `ip`, `created_at`.
- **`job_runs`** — cron observability + idempotency.

## 3.4 Integrity rules enforced in the database

1. `transaction_splits` sum = parent `amount_minor` (trigger).
2. Transactions reference **leaf** categories only (trigger).
3. `transfer_group_id` groups must net to zero in base currency (checked at write time in the repository; a deferred constraint is impractical across currencies).
4. Soft-deleted rows are excluded by every repository query, not by caller discipline.
5. `workspace_id` on a transaction must match `workspace_id` on its account (trigger) — blocks the §49 cross-workspace leak at the storage layer.
6. RLS on every tenant table: `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = current_setting('pockit.user_id')::uuid)`.

## 3.5 Indexing

- `transactions (workspace_id, posted_date DESC)` — the dominant query.
- `transactions (workspace_id, category_id, posted_date)` — category rollups.
- `transactions (workspace_id, account_id, posted_date)` — balances.
- `transactions (workspace_id, merchant_id)` — merchant analytics.
- `transactions (workspace_id, amount_minor, posted_date)` — duplicate candidate lookup.
- GIN trigram on `transactions.description` — search.
- Partial index `WHERE deleted_at IS NULL` on the hot paths.

/**
 * Pockit database schema — see docs/03-schema.md for the rationale.
 *
 * Conventions enforced throughout:
 *  - Money is `bigint` MINOR UNITS. Never numeric, never float.
 *  - Every tenant-owned row carries `workspaceId` and is covered by RLS.
 *  - Deletions are soft where the user might want them back.
 *  - Dates that describe a calendar day (a purchase) are `date`, not `timestamptz`.
 */
import {
  pgSchema, uuid, text, integer, bigint, boolean, timestamp, date, jsonb,
  numeric, index, uniqueIndex, primaryKey, smallint, check,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

export const pockit = pgSchema('pockit');

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const workspaceKind = pockit.enum('workspace_kind', ['personal', 'business', 'household']);
export const memberRole = pockit.enum('member_role', ['owner', 'admin', 'member', 'viewer']);
export const accountType = pockit.enum('account_type', [
  'chequing', 'savings', 'cash', 'credit_card', 'line_of_credit',
  'loan', 'mortgage', 'investment', 'business_chequing', 'other',
]);
export const normalBalance = pockit.enum('normal_balance', ['debit', 'credit']);
export const categoryKind = pockit.enum('category_kind', ['expense', 'income', 'transfer', 'investment']);
export const categoryClassification = pockit.enum('category_classification', ['fixed', 'variable']);
export const categoryNecessity = pockit.enum('category_necessity', ['essential', 'discretionary']);
export const transactionType = pockit.enum('transaction_type', [
  'expense', 'income', 'transfer', 'refund', 'investment', 'debt_payment',
]);
export const businessClassification = pockit.enum('business_classification', ['personal', 'business', 'split']);
export const transactionSource = pockit.enum('transaction_source', [
  'manual', 'csv', 'xlsx', 'pdf', 'image', 'video', 'api', 'demo', 'recurring',
]);
export const taxRelevance = pockit.enum('tax_relevance', [
  'none', 'possible_deduction', 'business_expense', 'reimbursable', 'income', 'other',
]);
export const refundAttribution = pockit.enum('refund_attribution', ['original_period', 'refund_period']);
export const budgetMethod = pockit.enum('budget_method', [
  'category', 'percentage', 'zero_based', 'savings_first', 'fixed_variable', 'custom',
]);
export const budgetPeriodKind = pockit.enum('budget_period_kind', [
  'weekly', 'biweekly', 'semimonthly', 'monthly', 'custom',
]);
export const budgetBucket = pockit.enum('budget_bucket', ['needs', 'wants', 'savings', 'debt']);
export const goalKind = pockit.enum('goal_kind', [
  'emergency_fund', 'vacation', 'car', 'house', 'tuition', 'investment',
  'business_capital', 'debt_payoff', 'general', 'custom',
]);
export const goalStatus = pockit.enum('goal_status', ['active', 'paused', 'achieved', 'abandoned']);
export const cadence = pockit.enum('cadence', [
  'weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual', 'custom',
]);
export const recurringKind = pockit.enum('recurring_kind', ['subscription', 'bill', 'income', 'transfer', 'other']);
export const recurringStatus = pockit.enum('recurring_status', ['candidate', 'active', 'paused', 'cancelled']);
export const assetClass = pockit.enum('asset_class', ['stock', 'etf', 'crypto', 'managed', 'cash', 'bond', 'other']);
export const invoiceStatus = pockit.enum('invoice_status', [
  'draft', 'sent', 'partial', 'paid', 'overdue', 'void',
]);
export const importStatus = pockit.enum('import_status', [
  'pending', 'extracting', 'review', 'committing', 'committed', 'failed', 'rolled_back',
]);
export const candidateStatus = pockit.enum('candidate_status', [
  'pending', 'accepted', 'rejected', 'duplicate', 'merged',
]);
export const sourceKind = pockit.enum('source_kind', [
  'csv', 'xlsx', 'pdf', 'image', 'video_frames', 'text', 'manual',
]);
export const fileRetention = pockit.enum('file_retention', ['delete_after_extract', 'keep', 'ask']);
export const storageDriverKind = pockit.enum('storage_driver', ['postgres', 'supabase', 'vercel_blob']);
export const matchType = pockit.enum('match_type', ['exact', 'contains', 'starts_with', 'regex']);
export const ruleSource = pockit.enum('rule_source', ['user', 'learned', 'system']);
export const insightSeverity = pockit.enum('insight_severity', ['info', 'notice', 'attention']);
export const notificationChannel = pockit.enum('notification_channel', ['in_app', 'email']);
export const themePref = pockit.enum('theme_pref', ['system', 'light', 'dark']);
export const incomeSchedule = pockit.enum('income_schedule', [
  'weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular',
]);

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const users = pockit.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  emailNormalized: text('email_normalized').notNull(),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [uniqueIndex('users_email_normalized_key').on(t.emailNormalized)]);

export const sessions = pockit.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Only the hash is stored; a database leak must not yield usable sessions.
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
  index('sessions_user_idx').on(t.userId),
]);

export const userProfiles = pockit.table('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  baseCurrency: text('base_currency').notNull().default('CAD'),
  timezone: text('timezone').notNull().default('America/Toronto'),
  locale: text('locale').notNull().default('en-CA'),
  theme: themePref('theme').notNull().default('system'),
  incomeSchedule: incomeSchedule('income_schedule'),
  approxIncomeMinor: bigint('approx_income_minor', { mode: 'bigint' }),
  nextPaydayDate: date('next_payday_date'),
  onboardingStep: integer('onboarding_step').notNull().default(0),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  /** Named stage, so resuming knows WHERE rather than just how far. */
  onboardingStage: text('onboarding_stage').notNull().default('not_started'),
  /** What they have told us so far, written after each screen rather than at the end. */
  onboardingAnswers: jsonb('onboarding_answers').$type<Record<string, unknown>>().notNull().default({}),
  tourCompletedAt: timestamp('tour_completed_at', { withTimezone: true }),
  // Privacy (spec §30): what happens to an uploaded file after extraction.
  fileRetention: fileRetention('file_retention').notNull().default('ask'),
  aiEnabled: boolean('ai_enabled').notNull().default(true),
  dashboardWidgets: jsonb('dashboard_widgets').$type<string[] | null>(),
  primaryIntent: text('primary_intent'),
  /** 'simple' hides advanced surfaces until the user asks for them. */
  experienceLevel: text('experience_level').notNull().default('simple'),
  /** Pockit Plus is active while this is in the future. Null means never subscribed. */
  plusUntil: timestamp('plus_until', { withTimezone: true }),
  plusSource: text('plus_source'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Tenancy                                                             */
/* ------------------------------------------------------------------ */

export const workspaces = pockit.table('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: workspaceKind('kind').notNull().default('personal'),
  baseCurrency: text('base_currency').notNull().default('CAD'),
  color: text('color'),
  isDemo: boolean('is_demo').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('workspaces_owner_idx').on(t.ownerUserId)]);

export const workspaceMembers = pockit.table('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.userId] }),
  index('workspace_members_user_idx').on(t.userId),
]);

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const accounts = pockit.table('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: accountType('type').notNull(),
  // Assets are 'debit' (positive = you own it); liabilities are 'credit'
  // (positive = you owe it). This is what stops credit cards double-counting.
  normalBalance: normalBalance('normal_balance').notNull(),
  currency: text('currency').notNull().default('CAD'),
  openingBalanceMinor: bigint('opening_balance_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  openingBalanceDate: date('opening_balance_date'),
  institution: text('institution'),
  // Last four digits only. A full account number is never stored.
  mask: text('mask'),
  creditLimitMinor: bigint('credit_limit_minor', { mode: 'bigint' }),
  interestRateBps: integer('interest_rate_bps'),
  statementDay: smallint('statement_day'),
  paymentDueDay: smallint('payment_due_day'),
  isActive: boolean('is_active').notNull().default(true),
  excludeFromNetWorth: boolean('exclude_from_net_worth').notNull().default(false),
  // Seam for a future bank-data provider (spec §42) — nothing else needs to change.
  externalProvider: text('external_provider'),
  externalId: text('external_id'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('accounts_workspace_idx').on(t.workspaceId),
  check('accounts_mask_len', sql`${t.mask} IS NULL OR length(${t.mask}) <= 4`),
]);

/** A user-asserted "this account was $X on this date", used to reconcile partial history. */
export const accountBalanceAnchors = pockit.table('account_balance_anchors', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  asOf: date('as_of').notNull(),
  balanceMinor: bigint('balance_minor', { mode: 'bigint' }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('anchor_account_date_key').on(t.accountId, t.asOf)]);

/* ------------------------------------------------------------------ */
/* Categories & merchants                                              */
/* ------------------------------------------------------------------ */

export const categories = pockit.table('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  kind: categoryKind('kind').notNull().default('expense'),
  // User-editable (spec §48) — the app must not assume everyone's priorities match.
  classification: categoryClassification('classification').notNull().default('variable'),
  necessity: categoryNecessity('necessity').notNull().default('discretionary'),
  icon: text('icon'),
  color: text('color'),
  isSystem: boolean('is_system').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  /** Shown in the first-choice picker; everything else lives behind "more". */
  isPrimary: boolean('is_primary').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('categories_workspace_slug_key').on(t.workspaceId, t.slug),
  index('categories_parent_idx').on(t.parentId),
]);

export const merchants = pockit.table('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  defaultCategoryId: uuid('default_category_id').references(() => categories.id, { onDelete: 'set null' }),
  defaultBusinessClassification: businessClassification('default_business_classification'),
  website: text('website'),
  txnCount: integer('txn_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('merchants_workspace_normalized_key').on(t.workspaceId, t.normalizedName)]);

/**
 * The "AI learns your preferences" feature (spec §4), made visible and reversible.
 * Correcting a transaction writes a rule here; the user can inspect and delete every
 * inference the system has made.
 */
export const merchantRules = pockit.table('merchant_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  matchType: matchType('match_type').notNull().default('contains'),
  pattern: text('pattern').notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
  setMerchantName: text('set_merchant_name'),
  businessClassificationValue: businessClassification('business_classification_value'),
  taxRelevanceValue: taxRelevance('tax_relevance_value'),
  priority: integer('priority').notNull().default(100),
  source: ruleSource('source').notNull().default('user'),
  isActive: boolean('is_active').notNull().default(true),
  timesApplied: integer('times_applied').notNull().default(0),
  lastAppliedAt: timestamp('last_applied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('merchant_rules_workspace_idx').on(t.workspaceId, t.isActive, t.priority)]);

/* ------------------------------------------------------------------ */
/* Files & imports (declared before transactions for FK ordering)      */
/* ------------------------------------------------------------------ */

export const uploadedFiles = pockit.table('uploaded_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  // Idempotency: re-uploading the same bytes must not create a second import.
  contentHash: text('content_hash').notNull(),
  storageDriver: storageDriverKind('storage_driver').notNull().default('postgres'),
  storageKey: text('storage_key'),
  pageCount: integer('page_count'),
  retention: fileRetention('retention').notNull().default('ask'),
  purgedAt: timestamp('purged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('uploaded_files_workspace_idx').on(t.workspaceId),
  index('uploaded_files_hash_idx').on(t.workspaceId, t.contentHash),
]);

/** Bytes for the default `postgres` storage driver. Never publicly addressable. */
export const fileBlobs = pockit.table('file_blobs', {
  fileId: uuid('file_id').primaryKey().references(() => uploadedFiles.id, { onDelete: 'cascade' }),
  bytes: text('bytes').notNull(), // base64; see lib/storage/postgres.ts
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const imports = pockit.table('imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').references(() => uploadedFiles.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  sourceKind: sourceKind('source_kind').notNull(),
  label: text('label'),
  status: importStatus('status').notNull().default('pending'),
  candidateCount: integer('candidate_count').notNull().default(0),
  importedCount: integer('imported_count').notNull().default(0),
  duplicateCount: integer('duplicate_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  errorDetail: text('error_detail'),
  options: jsonb('options'),
  committedAt: timestamp('committed_at', { withTimezone: true }),
  rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('imports_workspace_idx').on(t.workspaceId, t.createdAt)]);

export const receipts = pockit.table('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').references(() => uploadedFiles.id, { onDelete: 'set null' }),
  merchantName: text('merchant_name'),
  purchasedOn: date('purchased_on'),
  subtotalMinor: bigint('subtotal_minor', { mode: 'bigint' }),
  taxMinor: bigint('tax_minor', { mode: 'bigint' }),
  tipMinor: bigint('tip_minor', { mode: 'bigint' }),
  totalMinor: bigint('total_minor', { mode: 'bigint' }),
  currency: text('currency').notNull().default('CAD'),
  reimbursable: boolean('reimbursable').notNull().default(false),
  project: text('project'),
  customerId: uuid('customer_id'),
  // The AI may suggest, but the label reads as unreviewed until a human confirms.
  taxRelevanceSuggested: taxRelevance('tax_relevance_suggested'),
  extraction: jsonb('extraction'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('receipts_workspace_idx').on(t.workspaceId)]);

export const receiptItems = pockit.table('receipt_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiptId: uuid('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 4 }),
  unitPriceMinor: bigint('unit_price_minor', { mode: 'bigint' }),
  totalMinor: bigint('total_minor', { mode: 'bigint' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('receipt_items_receipt_idx').on(t.receiptId)]);

/* ------------------------------------------------------------------ */
/* Recurring                                                           */
/* ------------------------------------------------------------------ */

export const recurringSeries = pockit.table('recurring_series', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  merchantName: text('merchant_name'),
  merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  kind: recurringKind('kind').notNull().default('subscription'),
  type: transactionType('type').notNull().default('expense'),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('CAD'),
  amountVarianceBps: integer('amount_variance_bps').notNull().default(0),
  cadence: cadence('cadence').notNull().default('monthly'),
  intervalDays: integer('interval_days'),
  dayOfMonth: smallint('day_of_month'),
  nextExpectedDate: date('next_expected_date'),
  lastSeenDate: date('last_seen_date'),
  firstSeenDate: date('first_seen_date'),
  occurrenceCount: integer('occurrence_count').notNull().default(0),
  detectionConfidence: integer('detection_confidence').notNull().default(0),
  status: recurringStatus('status').notNull().default('candidate'),
  // Spec §12: "allow me to identify subscriptions I no longer care about"
  isWanted: boolean('is_wanted'),
  priceHistory: jsonb('price_history').$type<{ date: string; amountMinor: string }[] | null>(),
  /** True when the user created this by hand rather than it being detected. */
  isManual: boolean('is_manual').notNull().default(false),
  startDate: date('start_date'),
  endDate: date('end_date'),
  intervalCount: integer('interval_count').notNull().default(1),
  direction: text('direction').notNull().default('outflow'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('recurring_workspace_idx').on(t.workspaceId, t.status)]);

/* ------------------------------------------------------------------ */
/* Transactions — the centre of the system                             */
/* ------------------------------------------------------------------ */

export const transactions = pockit.table('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),

  /** The calendar day the money moved. Not a timestamp: a purchase has a date, not an instant. */
  postedDate: date('posted_date').notNull(),
  bookedAt: timestamp('booked_at', { withTimezone: true }),

  description: text('description').notNull(),
  /** Whatever the source said, kept forever so extraction can be audited (spec §3). */
  originalDescription: text('original_description'),
  merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
  merchantName: text('merchant_name'),

  /** Signed, in the account's own direction. See docs/03-schema.md §Ledger semantics. */
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('CAD'),
  /** The same value in the workspace's base currency. Original is never overwritten. */
  baseAmountMinor: bigint('base_amount_minor', { mode: 'bigint' }).notNull(),
  baseCurrency: text('base_currency').notNull().default('CAD'),
  fxRate: numeric('fx_rate', { precision: 20, scale: 10 }),
  fxRateDate: date('fx_rate_date'),

  type: transactionType('type').notNull().default('expense'),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  paymentMethod: text('payment_method'),
  businessClassification: businessClassification('business_classification').notNull().default('personal'),

  isRecurring: boolean('is_recurring').notNull().default(false),
  recurringSeriesId: uuid('recurring_series_id').references(() => recurringSeries.id, { onDelete: 'set null' }),

  taxRelevance: taxRelevance('tax_relevance').notNull().default('none'),
  /** Until a human confirms, a tax label is a suggestion and renders as one (spec §17). */
  taxReviewedByUser: boolean('tax_reviewed_by_user').notNull().default(false),

  /** Both sides of a transfer share this. Either side alone is never counted. */
  transferGroupId: uuid('transfer_group_id'),
  /** A refund points at the purchase it reverses so category totals net correctly. */
  offsetsTransactionId: uuid('offsets_transaction_id'),
  refundAttribution: refundAttribution('refund_attribution').notNull().default('refund_period'),

  notes: text('notes'),
  source: transactionSource('source').notNull().default('manual'),
  /** The bank's own id for a synced transaction (Plaid), so a sync never adds it twice. */
  externalId: text('external_id'),
  importId: uuid('import_id').references(() => imports.id, { onDelete: 'set null' }),
  receiptId: uuid('receipt_id').references(() => receipts.id, { onDelete: 'set null' }),

  aiConfidence: integer('ai_confidence'),
  needsReview: boolean('needs_review').notNull().default(false),
  /** Where this row came from: page, frames, bbox, raw source line (spec §45). */
  provenance: jsonb('provenance'),

  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('tx_ws_date_idx').on(t.workspaceId, t.postedDate.desc()),
  index('tx_ws_cat_date_idx').on(t.workspaceId, t.categoryId, t.postedDate),
  index('tx_ws_acct_date_idx').on(t.workspaceId, t.accountId, t.postedDate),
  index('tx_ws_merchant_idx').on(t.workspaceId, t.merchantId),
  index('tx_ws_amount_date_idx').on(t.workspaceId, t.amountMinor, t.postedDate),
  index('tx_transfer_group_idx').on(t.transferGroupId),
  index('tx_import_idx').on(t.importId),
  index('tx_recurring_idx').on(t.recurringSeriesId),
  check('tx_ai_confidence_range', sql`${t.aiConfidence} IS NULL OR (${t.aiConfidence} >= 0 AND ${t.aiConfidence} <= 100)`),
]);

/** Splits must sum exactly to the parent amount — enforced by trigger (spec §43). */
export const transactionSplits = pockit.table('transaction_splits', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  businessClassification: businessClassification('business_classification').notNull().default('personal'),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  percentBps: integer('percent_bps'),
  note: text('note'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('splits_transaction_idx').on(t.transactionId)]);

export const tags = pockit.table('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('tags_workspace_name_key').on(t.workspaceId, t.name)]);

export const transactionTags = pockit.table('transaction_tags', {
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.transactionId, t.tagId] })]);

export const recurringOccurrences = pockit.table('recurring_occurrences', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  seriesId: uuid('series_id').notNull().references(() => recurringSeries.id, { onDelete: 'cascade' }),
  expectedDate: date('expected_date').notNull(),
  expectedAmountMinor: bigint('expected_amount_minor', { mode: 'bigint' }).notNull(),
  actualTransactionId: uuid('actual_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  actualDate: date('actual_date'),
  actualAmountMinor: bigint('actual_amount_minor', { mode: 'bigint' }),
  skipped: boolean('skipped').notNull().default(false),
}, (t) => [uniqueIndex('occurrence_series_date_key').on(t.seriesId, t.expectedDate)]);

/* ------------------------------------------------------------------ */
/* Import staging                                                      */
/* ------------------------------------------------------------------ */

/**
 * The staging ledger. AI output lands HERE, never in `transactions`.
 * Nothing in this table affects a single figure in the app until a human accepts it.
 */
export const importCandidates = pockit.table('import_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  importId: uuid('import_id').notNull().references(() => imports.id, { onDelete: 'cascade' }),

  postedDate: date('posted_date'),
  description: text('description'),
  originalDescription: text('original_description'),
  merchantName: text('merchant_name'),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }),
  currency: text('currency').notNull().default('CAD'),
  type: transactionType('type').notNull().default('expense'),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  businessClassification: businessClassification('business_classification').notNull().default('personal'),
  notes: text('notes'),

  status: candidateStatus('status').notNull().default('pending'),
  duplicateOfTransactionId: uuid('duplicate_of_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  duplicateScore: integer('duplicate_score'),
  /** The human-readable reasons behind the score, so a merge is never a black box. */
  duplicateReasons: jsonb('duplicate_reasons'),

  confidence: integer('confidence'),
  /** Per-field confidence drives the "please verify this field" highlighting (spec §25). */
  fieldConfidence: jsonb('field_confidence'),
  provenance: jsonb('provenance'),
  rawExtraction: jsonb('raw_extraction'),
  validationError: text('validation_error'),

  createdTransactionId: uuid('created_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('candidates_import_idx').on(t.importId, t.sortOrder)]);

/** Every model call: cost tracking (spec §50) and extraction debugging (spec §45). */
export const aiExtractions = pockit.table('ai_extractions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  importId: uuid('import_id').references(() => imports.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  operation: text('operation').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  latencyMs: integer('latency_ms'),
  costEstimateMinor: bigint('cost_estimate_minor', { mode: 'bigint' }),
  status: text('status').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('ai_extractions_workspace_idx').on(t.workspaceId, t.createdAt)]);

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export const budgets = pockit.table('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  method: budgetMethod('method').notNull().default('category'),
  period: budgetPeriodKind('period').notNull().default('monthly'),
  periodStart: date('period_start').notNull(),
  periodDays: integer('period_days'),
  expectedIncomeMinor: bigint('expected_income_minor', { mode: 'bigint' }),
  rollover: boolean('rollover').notNull().default(false),
  /** Method-specific payload, validated by a Zod discriminated union at the boundary. */
  rules: jsonb('rules'),
  /** What the user said they were trying to achieve, so advice can be explained. */
  intent: text('intent'),
  setupAnswers: jsonb('setup_answers'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('budgets_workspace_idx').on(t.workspaceId, t.isActive)]);

export const budgetAllocations = pockit.table('budget_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  budgetId: uuid('budget_id').notNull().references(() => budgets.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  bucket: budgetBucket('bucket'),
  label: text('label'),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }),
  percentBps: integer('percent_bps'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('budget_allocations_budget_idx').on(t.budgetId)]);

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

export const goals = pockit.table('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: goalKind('kind').notNull().default('general'),
  targetMinor: bigint('target_minor', { mode: 'bigint' }).notNull(),
  currentMinor: bigint('current_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  currency: text('currency').notNull().default('CAD'),
  targetDate: date('target_date'),
  priority: integer('priority').notNull().default(3),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  monthlyContributionMinor: bigint('monthly_contribution_minor', { mode: 'bigint' }),
  status: goalStatus('status').notNull().default('active'),
  achievedAt: timestamp('achieved_at', { withTimezone: true }),
  notes: text('notes'),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('goals_workspace_idx').on(t.workspaceId, t.status)]);

export const goalContributions = pockit.table('goal_contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  occurredOn: date('occurred_on').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  source: text('source').notNull().default('manual'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('goal_contributions_goal_idx').on(t.goalId, t.occurredOn)]);

/* ------------------------------------------------------------------ */
/* Position: net worth, investments, debts                             */
/* ------------------------------------------------------------------ */

export const assets = pockit.table('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull().default('other'),
  valueMinor: bigint('value_minor', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('CAD'),
  asOf: date('as_of').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('assets_workspace_idx').on(t.workspaceId)]);

export const liabilities = pockit.table('liabilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull().default('other'),
  balanceMinor: bigint('balance_minor', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('CAD'),
  asOf: date('as_of').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('liabilities_workspace_idx').on(t.workspaceId)]);

export const netWorthSnapshots = pockit.table('net_worth_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  asOf: date('as_of').notNull(),
  assetsMinor: bigint('assets_minor', { mode: 'bigint' }).notNull(),
  liabilitiesMinor: bigint('liabilities_minor', { mode: 'bigint' }).notNull(),
  netMinor: bigint('net_minor', { mode: 'bigint' }).notNull(),
  breakdown: jsonb('breakdown'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('networth_workspace_date_key').on(t.workspaceId, t.asOf)]);

export const holdings = pockit.table('holdings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  symbol: text('symbol'),
  name: text('name').notNull(),
  assetClass: assetClass('asset_class').notNull().default('stock'),
  quantity: numeric('quantity', { precision: 28, scale: 10 }).notNull().default('0'),
  costBasisMinor: bigint('cost_basis_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  currentValueMinor: bigint('current_value_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  valueAsOf: date('value_as_of'),
  currency: text('currency').notNull().default('CAD'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('holdings_workspace_idx').on(t.workspaceId)]);

export const holdingLots = pockit.table('holding_lots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  holdingId: uuid('holding_id').notNull().references(() => holdings.id, { onDelete: 'cascade' }),
  acquiredOn: date('acquired_on').notNull(),
  quantity: numeric('quantity', { precision: 28, scale: 10 }).notNull(),
  unitCostMinor: bigint('unit_cost_minor', { mode: 'bigint' }).notNull(),
  feesMinor: bigint('fees_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
}, (t) => [index('holding_lots_holding_idx').on(t.holdingId)]);

export const debts = pockit.table('debts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  balanceMinor: bigint('balance_minor', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('CAD'),
  aprBps: integer('apr_bps').notNull().default(0),
  minPaymentMinor: bigint('min_payment_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  paymentDay: smallint('payment_day'),
  targetPayoffDate: date('target_payoff_date'),
  strategyOrder: integer('strategy_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('debts_workspace_idx').on(t.workspaceId)]);

export const debtPayments = pockit.table('debt_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  debtId: uuid('debt_id').notNull().references(() => debts.id, { onDelete: 'cascade' }),
  paidOn: date('paid_on').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  principalMinor: bigint('principal_minor', { mode: 'bigint' }),
  interestMinor: bigint('interest_minor', { mode: 'bigint' }),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
}, (t) => [index('debt_payments_debt_idx').on(t.debtId, t.paidOn)]);

/* ------------------------------------------------------------------ */
/* Business                                                            */
/* ------------------------------------------------------------------ */

export const customers = pockit.table('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('customers_workspace_idx').on(t.workspaceId)]);

export const vendors = pockit.table('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('vendors_workspace_idx').on(t.workspaceId)]);

export const invoices = pockit.table('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  number: text('number').notNull(),
  status: invoiceStatus('status').notNull().default('draft'),
  issueDate: date('issue_date').notNull(),
  dueDate: date('due_date').notNull(),
  subtotalMinor: bigint('subtotal_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  taxMinor: bigint('tax_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  amountPaidMinor: bigint('amount_paid_minor', { mode: 'bigint' }).notNull().default(sql`0`),
  currency: text('currency').notNull().default('CAD'),
  notes: text('notes'),
  terms: text('terms'),
  paidTransactionId: uuid('paid_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('invoices_workspace_number_key').on(t.workspaceId, t.number),
  index('invoices_workspace_status_idx').on(t.workspaceId, t.status, t.dueDate),
]);

export const invoiceItems = pockit.table('invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 4 }).notNull().default('1'),
  unitPriceMinor: bigint('unit_price_minor', { mode: 'bigint' }).notNull(),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('invoice_items_invoice_idx').on(t.invoiceId)]);

export const mileageLogs = pockit.table('mileage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  occurredOn: date('occurred_on').notNull(),
  distance: numeric('distance', { precision: 12, scale: 2 }).notNull(),
  unit: text('unit').notNull().default('km'),
  ratePerUnitMinor: bigint('rate_per_unit_minor', { mode: 'bigint' }).notNull(),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  purpose: text('purpose'),
  fromLocation: text('from_location'),
  toLocation: text('to_location'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('mileage_workspace_idx').on(t.workspaceId, t.occurredOn)]);

/* ------------------------------------------------------------------ */
/* System                                                              */
/* ------------------------------------------------------------------ */

export const fxRates = pockit.table('fx_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  base: text('base').notNull(),
  quote: text('quote').notNull(),
  rate: numeric('rate', { precision: 20, scale: 10 }).notNull(),
  asOf: date('as_of').notNull(),
  source: text('source').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('fx_rates_pair_date_key').on(t.base, t.quote, t.asOf)]);

export const insights = pockit.table('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  headline: text('headline').notNull(),
  detail: text('detail'),
  severity: insightSeverity('severity').notNull().default('info'),
  /** The computed figures. The AI phrases these; it never produces them. */
  metrics: jsonb('metrics'),
  /** Provenance: every insight is traceable to transactions (spec §36). */
  transactionIds: jsonb('transaction_ids').$type<string[] | null>(),
  dedupeKey: text('dedupe_key'),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('insights_workspace_idx').on(t.workspaceId, t.createdAt),
  uniqueIndex('insights_dedupe_key').on(t.workspaceId, t.dedupeKey),
]);

export const notificationRules = pockit.table('notification_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  channel: notificationChannel('channel').notNull().default('in_app'),
  config: jsonb('config'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('notification_rules_ws_kind_key').on(t.workspaceId, t.kind)]);

export const notifications = pockit.table('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  severity: insightSeverity('severity').notNull().default('info'),
  href: text('href'),
  /** Structural protection against the notification spam the spec warns about (§35). */
  dedupeKey: text('dedupe_key').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('notifications_dedupe_key').on(t.workspaceId, t.dedupeKey),
  index('notifications_workspace_idx').on(t.workspaceId, t.createdAt),
]);

export const savedViews = pockit.table('saved_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  query: jsonb('query').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('saved_views_workspace_idx').on(t.workspaceId, t.userId)]);

export const auditLogs = pockit.table('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  metadata: jsonb('metadata'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_logs_workspace_idx').on(t.workspaceId, t.createdAt),
  index('audit_logs_actor_idx').on(t.actorUserId, t.createdAt),
]);

export const jobRuns = pockit.table('job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  job: text('job').notNull(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  detail: jsonb('detail'),
  error: text('error'),
}, (t) => [index('job_runs_job_idx').on(t.job, t.startedAt)]);

export const rateLimits = pockit.table('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const workspaceRelations = relations(workspaces, ({ many, one }) => ({
  owner: one(users, { fields: [workspaces.ownerUserId], references: [users.id] }),
  members: many(workspaceMembers),
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
}));

export const transactionRelations = relations(transactions, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [transactions.workspaceId], references: [workspaces.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  merchant: one(merchants, { fields: [transactions.merchantId], references: [merchants.id] }),
  receipt: one(receipts, { fields: [transactions.receiptId], references: [receipts.id] }),
  splits: many(transactionSplits),
  tags: many(transactionTags),
}));

export const accountRelations = relations(accounts, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [accounts.workspaceId], references: [workspaces.id] }),
  transactions: many(transactions),
}));

export const categoryRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: 'category_tree' }),
  children: many(categories, { relationName: 'category_tree' }),
  transactions: many(transactions),
}));

export const importRelations = relations(imports, ({ one, many }) => ({
  file: one(uploadedFiles, { fields: [imports.fileId], references: [uploadedFiles.id] }),
  candidates: many(importCandidates),
}));

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionSplit = typeof transactionSplits.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type BudgetAllocation = typeof budgetAllocations.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type RecurringSeries = typeof recurringSeries.$inferSelect;
export type ImportRow = typeof imports.$inferSelect;
export type ImportCandidate = typeof importCandidates.$inferSelect;
export type Merchant = typeof merchants.$inferSelect;
export type MerchantRule = typeof merchantRules.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type LiabilityRow = typeof liabilities.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;

/* ---------------- Investing ---------------- */

/**
 * One risk profile per workspace. The raw answers are kept alongside the derived
 * allocation so the profile can be recomputed if the model changes, rather than
 * quietly going stale.
 */
export const investorProfiles = pockit.table('investor_profiles', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  answers: jsonb('answers').notNull(),
  level: text('level').notNull(),
  stocksPct: integer('stocks_pct'),
  bondsPct: integer('bonds_pct'),
  cashPct: integer('cash_pct'),
  /** When the disclaimers were accepted, not merely that they were. */
  disclaimerAcceptedAt: timestamp('disclaimer_accepted_at', { withTimezone: true }).notNull(),
  disclaimerVersion: integer('disclaimer_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------- security, feedback, and Pock ---------------- */

/**
 * A user's TOTP enrolment.
 *
 * `secretEncrypted` is exactly that — AES-256-GCM, not a hash, because verifying a
 * code needs the original value back. `confirmedAt` stays null until a correct code
 * proves the authenticator works, so nobody enrols themselves out of their account.
 */
export const userTotp = pockit.table('user_totp', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  secretEncrypted: text('secret_encrypted').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  lastUsedStep: bigint('last_used_step', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Recovery codes, hashed like passwords because they are password-equivalent. */
export const recoveryCodes = pockit.table('recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('recovery_codes_user_idx').on(t.userId)]);

/** What people tell us is wrong. Survives the account that reported it. */
export const feedback = pockit.table('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  page: text('page'),
  contactOk: boolean('contact_ok').notNull().default(false),
  status: text('status').notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One conversation with Pock. */
export const pockThreads = pockit.table('pock_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  symbol: text('symbol'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('pock_threads_workspace_idx').on(t.workspaceId, t.updatedAt)]);

/** One turn in it. `facts` records what the answer was grounded in, for auditing. */
export const pockMessages = pockit.table('pock_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull().references(() => pockThreads.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  body: text('body').notNull(),
  facts: jsonb('facts'),
  model: text('model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('pock_messages_thread_idx').on(t.threadId, t.createdAt)]);

/**
 * A named watchlist. A table rather than a name on each item, so a list someone
 * creates and has not filled yet still exists when they come back to it.
 */
export const watchlists = pockit.table('watchlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('watchlists_workspace_idx').on(t.workspaceId)]);

/**
 * Symbols someone is watching. Deliberately not `holdings`: a holding is owned and
 * counts towards net worth, a watchlist item is only being looked at, and merging
 * them would put imaginary money into real totals.
 */
export const watchlistItems = pockit.table('watchlist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  listId: uuid('list_id').notNull().references(() => watchlists.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('watchlist_items_workspace_idx').on(t.workspaceId)]);

/** A connected bank login (Plaid). The access token is encrypted; only the server reads it. */
export const bankConnections = pockit.table('bank_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('plaid'),
  itemId: text('item_id').notNull(),
  accessTokenEnc: text('access_token_enc').notNull(),
  institutionName: text('institution_name'),
  cursor: text('cursor'),
  status: text('status').notNull().default('active'),
  error: text('error'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Single-use invite codes for joining a shared space. */
export const spaceInvites = pockit.table('space_invites', {
  code: text('code').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

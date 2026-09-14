CREATE SCHEMA "pockit";
--> statement-breakpoint
CREATE TYPE "pockit"."account_type" AS ENUM('chequing', 'savings', 'cash', 'credit_card', 'line_of_credit', 'loan', 'mortgage', 'investment', 'business_chequing', 'other');--> statement-breakpoint
CREATE TYPE "pockit"."asset_class" AS ENUM('stock', 'etf', 'crypto', 'managed', 'cash', 'bond', 'other');--> statement-breakpoint
CREATE TYPE "pockit"."budget_bucket" AS ENUM('needs', 'wants', 'savings', 'debt');--> statement-breakpoint
CREATE TYPE "pockit"."budget_method" AS ENUM('category', 'percentage', 'zero_based', 'savings_first', 'fixed_variable', 'custom');--> statement-breakpoint
CREATE TYPE "pockit"."budget_period_kind" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly', 'custom');--> statement-breakpoint
CREATE TYPE "pockit"."business_classification" AS ENUM('personal', 'business', 'split');--> statement-breakpoint
CREATE TYPE "pockit"."cadence" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual', 'custom');--> statement-breakpoint
CREATE TYPE "pockit"."candidate_status" AS ENUM('pending', 'accepted', 'rejected', 'duplicate', 'merged');--> statement-breakpoint
CREATE TYPE "pockit"."category_classification" AS ENUM('fixed', 'variable');--> statement-breakpoint
CREATE TYPE "pockit"."category_kind" AS ENUM('expense', 'income', 'transfer', 'investment');--> statement-breakpoint
CREATE TYPE "pockit"."category_necessity" AS ENUM('essential', 'discretionary');--> statement-breakpoint
CREATE TYPE "pockit"."file_retention" AS ENUM('delete_after_extract', 'keep', 'ask');--> statement-breakpoint
CREATE TYPE "pockit"."goal_kind" AS ENUM('emergency_fund', 'vacation', 'car', 'house', 'tuition', 'investment', 'business_capital', 'debt_payoff', 'general', 'custom');--> statement-breakpoint
CREATE TYPE "pockit"."goal_status" AS ENUM('active', 'paused', 'achieved', 'abandoned');--> statement-breakpoint
CREATE TYPE "pockit"."import_status" AS ENUM('pending', 'extracting', 'review', 'committing', 'committed', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "pockit"."income_schedule" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular');--> statement-breakpoint
CREATE TYPE "pockit"."insight_severity" AS ENUM('info', 'notice', 'attention');--> statement-breakpoint
CREATE TYPE "pockit"."invoice_status" AS ENUM('draft', 'sent', 'partial', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "pockit"."match_type" AS ENUM('exact', 'contains', 'starts_with', 'regex');--> statement-breakpoint
CREATE TYPE "pockit"."member_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "pockit"."normal_balance" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "pockit"."notification_channel" AS ENUM('in_app', 'email');--> statement-breakpoint
CREATE TYPE "pockit"."recurring_kind" AS ENUM('subscription', 'bill', 'income', 'transfer', 'other');--> statement-breakpoint
CREATE TYPE "pockit"."recurring_status" AS ENUM('candidate', 'active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "pockit"."refund_attribution" AS ENUM('original_period', 'refund_period');--> statement-breakpoint
CREATE TYPE "pockit"."rule_source" AS ENUM('user', 'learned', 'system');--> statement-breakpoint
CREATE TYPE "pockit"."source_kind" AS ENUM('csv', 'xlsx', 'pdf', 'image', 'video_frames', 'text', 'manual');--> statement-breakpoint
CREATE TYPE "pockit"."storage_driver" AS ENUM('postgres', 'supabase', 'vercel_blob');--> statement-breakpoint
CREATE TYPE "pockit"."tax_relevance" AS ENUM('none', 'possible_deduction', 'business_expense', 'reimbursable', 'income', 'other');--> statement-breakpoint
CREATE TYPE "pockit"."theme_pref" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "pockit"."transaction_source" AS ENUM('manual', 'csv', 'xlsx', 'pdf', 'image', 'video', 'api', 'demo', 'recurring');--> statement-breakpoint
CREATE TYPE "pockit"."transaction_type" AS ENUM('expense', 'income', 'transfer', 'refund', 'investment', 'debt_payment');--> statement-breakpoint
CREATE TYPE "pockit"."workspace_kind" AS ENUM('personal', 'business');--> statement-breakpoint
CREATE TABLE "pockit"."account_balance_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"balance_minor" bigint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "pockit"."account_type" NOT NULL,
	"normal_balance" "pockit"."normal_balance" NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"opening_balance_date" date,
	"institution" text,
	"mask" text,
	"credit_limit_minor" bigint,
	"interest_rate_bps" integer,
	"statement_day" smallint,
	"payment_due_day" smallint,
	"is_active" boolean DEFAULT true NOT NULL,
	"exclude_from_net_worth" boolean DEFAULT false NOT NULL,
	"external_provider" text,
	"external_id" text,
	"last_synced_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "accounts_mask_len" CHECK ("pockit"."accounts"."mask" IS NULL OR length("pockit"."accounts"."mask") <= 4)
);
--> statement-breakpoint
CREATE TABLE "pockit"."ai_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"import_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"cost_estimate_minor" bigint,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"value_minor" bigint NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"as_of" date NOT NULL,
	"account_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"workspace_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"metadata" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."budget_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"category_id" uuid,
	"bucket" "pockit"."budget_bucket",
	"label" text,
	"amount_minor" bigint,
	"percent_bps" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"method" "pockit"."budget_method" DEFAULT 'category' NOT NULL,
	"period" "pockit"."budget_period_kind" DEFAULT 'monthly' NOT NULL,
	"period_start" date NOT NULL,
	"period_days" integer,
	"expected_income_minor" bigint,
	"rollover" boolean DEFAULT false NOT NULL,
	"rules" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "pockit"."category_kind" DEFAULT 'expense' NOT NULL,
	"classification" "pockit"."category_classification" DEFAULT 'variable' NOT NULL,
	"necessity" "pockit"."category_necessity" DEFAULT 'discretionary' NOT NULL,
	"icon" text,
	"color" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."debt_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"principal_minor" bigint,
	"interest_minor" bigint,
	"transaction_id" uuid
);
--> statement-breakpoint
CREATE TABLE "pockit"."debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid,
	"balance_minor" bigint NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"apr_bps" integer DEFAULT 0 NOT NULL,
	"min_payment_minor" bigint DEFAULT 0 NOT NULL,
	"payment_day" smallint,
	"target_payoff_date" date,
	"strategy_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."file_blobs" (
	"file_id" uuid PRIMARY KEY NOT NULL,
	"bytes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"as_of" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"transaction_id" uuid,
	"occurred_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "pockit"."goal_kind" DEFAULT 'general' NOT NULL,
	"target_minor" bigint NOT NULL,
	"current_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"target_date" date,
	"priority" integer DEFAULT 3 NOT NULL,
	"account_id" uuid,
	"monthly_contribution_minor" bigint,
	"status" "pockit"."goal_status" DEFAULT 'active' NOT NULL,
	"achieved_at" timestamp with time zone,
	"notes" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."holding_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"holding_id" uuid NOT NULL,
	"acquired_on" date NOT NULL,
	"quantity" numeric(28, 10) NOT NULL,
	"unit_cost_minor" bigint NOT NULL,
	"fees_minor" bigint DEFAULT 0 NOT NULL,
	"transaction_id" uuid
);
--> statement-breakpoint
CREATE TABLE "pockit"."holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid,
	"symbol" text,
	"name" text NOT NULL,
	"asset_class" "pockit"."asset_class" DEFAULT 'stock' NOT NULL,
	"quantity" numeric(28, 10) DEFAULT '0' NOT NULL,
	"cost_basis_minor" bigint DEFAULT 0 NOT NULL,
	"current_value_minor" bigint DEFAULT 0 NOT NULL,
	"value_as_of" date,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."import_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"posted_date" date,
	"description" text,
	"original_description" text,
	"merchant_name" text,
	"amount_minor" bigint,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"type" "pockit"."transaction_type" DEFAULT 'expense' NOT NULL,
	"category_id" uuid,
	"account_id" uuid,
	"business_classification" "pockit"."business_classification" DEFAULT 'personal' NOT NULL,
	"notes" text,
	"status" "pockit"."candidate_status" DEFAULT 'pending' NOT NULL,
	"duplicate_of_transaction_id" uuid,
	"duplicate_score" integer,
	"duplicate_reasons" jsonb,
	"confidence" integer,
	"field_confidence" jsonb,
	"provenance" jsonb,
	"raw_extraction" jsonb,
	"validation_error" text,
	"created_transaction_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid,
	"created_by" uuid,
	"source_kind" "pockit"."source_kind" NOT NULL,
	"label" text,
	"status" "pockit"."import_status" DEFAULT 'pending' NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_detail" text,
	"options" jsonb,
	"committed_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"headline" text NOT NULL,
	"detail" text,
	"severity" "pockit"."insight_severity" DEFAULT 'info' NOT NULL,
	"metrics" jsonb,
	"transaction_ids" jsonb,
	"dedupe_key" text,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 4) DEFAULT '1' NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid,
	"number" text NOT NULL,
	"status" "pockit"."invoice_status" DEFAULT 'draft' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"amount_paid_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"notes" text,
	"terms" text,
	"paid_transaction_id" uuid,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"workspace_id" uuid,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"detail" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "pockit"."liabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"balance_minor" bigint NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"as_of" date NOT NULL,
	"account_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."merchant_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"match_type" "pockit"."match_type" DEFAULT 'contains' NOT NULL,
	"pattern" text NOT NULL,
	"category_id" uuid,
	"merchant_id" uuid,
	"set_merchant_name" text,
	"business_classification_value" "pockit"."business_classification",
	"tax_relevance_value" "pockit"."tax_relevance",
	"priority" integer DEFAULT 100 NOT NULL,
	"source" "pockit"."rule_source" DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"times_applied" integer DEFAULT 0 NOT NULL,
	"last_applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"default_category_id" uuid,
	"default_business_classification" "pockit"."business_classification",
	"website" text,
	"txn_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."mileage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"distance" numeric(12, 2) NOT NULL,
	"unit" text DEFAULT 'km' NOT NULL,
	"rate_per_unit_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"purpose" text,
	"from_location" text,
	"to_location" text,
	"customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."net_worth_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"assets_minor" bigint NOT NULL,
	"liabilities_minor" bigint NOT NULL,
	"net_minor" bigint NOT NULL,
	"breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."notification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"channel" "pockit"."notification_channel" DEFAULT 'in_app' NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"severity" "pockit"."insight_severity" DEFAULT 'info' NOT NULL,
	"href" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 4),
	"unit_price_minor" bigint,
	"total_minor" bigint,
	"category_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid,
	"merchant_name" text,
	"purchased_on" date,
	"subtotal_minor" bigint,
	"tax_minor" bigint,
	"tip_minor" bigint,
	"total_minor" bigint,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"reimbursable" boolean DEFAULT false NOT NULL,
	"project" text,
	"customer_id" uuid,
	"tax_relevance_suggested" "pockit"."tax_relevance",
	"extraction" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."recurring_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"expected_date" date NOT NULL,
	"expected_amount_minor" bigint NOT NULL,
	"actual_transaction_id" uuid,
	"actual_date" date,
	"actual_amount_minor" bigint,
	"skipped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."recurring_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"merchant_name" text,
	"merchant_id" uuid,
	"category_id" uuid,
	"account_id" uuid,
	"kind" "pockit"."recurring_kind" DEFAULT 'subscription' NOT NULL,
	"type" "pockit"."transaction_type" DEFAULT 'expense' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"amount_variance_bps" integer DEFAULT 0 NOT NULL,
	"cadence" "pockit"."cadence" DEFAULT 'monthly' NOT NULL,
	"interval_days" integer,
	"day_of_month" smallint,
	"next_expected_date" date,
	"last_seen_date" date,
	"first_seen_date" date,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"detection_confidence" integer DEFAULT 0 NOT NULL,
	"status" "pockit"."recurring_status" DEFAULT 'candidate' NOT NULL,
	"is_wanted" boolean,
	"price_history" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid,
	"business_classification" "pockit"."business_classification" DEFAULT 'personal' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"percent_bps" integer,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."transaction_tags" (
	"transaction_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "transaction_tags_transaction_id_tag_id_pk" PRIMARY KEY("transaction_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "pockit"."transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"posted_date" date NOT NULL,
	"booked_at" timestamp with time zone,
	"description" text NOT NULL,
	"original_description" text,
	"merchant_id" uuid,
	"merchant_name" text,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"base_currency" text DEFAULT 'CAD' NOT NULL,
	"fx_rate" numeric(20, 10),
	"fx_rate_date" date,
	"type" "pockit"."transaction_type" DEFAULT 'expense' NOT NULL,
	"category_id" uuid,
	"payment_method" text,
	"business_classification" "pockit"."business_classification" DEFAULT 'personal' NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_series_id" uuid,
	"tax_relevance" "pockit"."tax_relevance" DEFAULT 'none' NOT NULL,
	"tax_reviewed_by_user" boolean DEFAULT false NOT NULL,
	"transfer_group_id" uuid,
	"offsets_transaction_id" uuid,
	"refund_attribution" "pockit"."refund_attribution" DEFAULT 'refund_period' NOT NULL,
	"notes" text,
	"source" "pockit"."transaction_source" DEFAULT 'manual' NOT NULL,
	"import_id" uuid,
	"receipt_id" uuid,
	"ai_confidence" integer,
	"needs_review" boolean DEFAULT false NOT NULL,
	"provenance" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tx_ai_confidence_range" CHECK ("pockit"."transactions"."ai_confidence" IS NULL OR ("pockit"."transactions"."ai_confidence" >= 0 AND "pockit"."transactions"."ai_confidence" <= 100))
);
--> statement-breakpoint
CREATE TABLE "pockit"."uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_hash" text NOT NULL,
	"storage_driver" "pockit"."storage_driver" DEFAULT 'postgres' NOT NULL,
	"storage_key" text,
	"page_count" integer,
	"retention" "pockit"."file_retention" DEFAULT 'ask' NOT NULL,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pockit"."user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"base_currency" text DEFAULT 'CAD' NOT NULL,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"locale" text DEFAULT 'en-CA' NOT NULL,
	"theme" "pockit"."theme_pref" DEFAULT 'system' NOT NULL,
	"income_schedule" "pockit"."income_schedule",
	"approx_income_minor" bigint,
	"next_payday_date" date,
	"onboarding_step" integer DEFAULT 0 NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"file_retention" "pockit"."file_retention" DEFAULT 'ask' NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"dashboard_widgets" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pockit"."vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"category_id" uuid,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pockit"."workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "pockit"."member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pockit"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "pockit"."workspace_kind" DEFAULT 'personal' NOT NULL,
	"base_currency" text DEFAULT 'CAD' NOT NULL,
	"color" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pockit"."account_balance_anchors" ADD CONSTRAINT "account_balance_anchors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."account_balance_anchors" ADD CONSTRAINT "account_balance_anchors_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."ai_extractions" ADD CONSTRAINT "ai_extractions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."ai_extractions" ADD CONSTRAINT "ai_extractions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "pockit"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."assets" ADD CONSTRAINT "assets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "pockit"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."budget_allocations" ADD CONSTRAINT "budget_allocations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."budget_allocations" ADD CONSTRAINT "budget_allocations_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "pockit"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."budget_allocations" ADD CONSTRAINT "budget_allocations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "pockit"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."categories" ADD CONSTRAINT "categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."customers" ADD CONSTRAINT "customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."debt_payments" ADD CONSTRAINT "debt_payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "pockit"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."debt_payments" ADD CONSTRAINT "debt_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."debts" ADD CONSTRAINT "debts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."debts" ADD CONSTRAINT "debts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."file_blobs" ADD CONSTRAINT "file_blobs_file_id_uploaded_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "pockit"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."goal_contributions" ADD CONSTRAINT "goal_contributions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "pockit"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."goal_contributions" ADD CONSTRAINT "goal_contributions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."goals" ADD CONSTRAINT "goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."goals" ADD CONSTRAINT "goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."holding_lots" ADD CONSTRAINT "holding_lots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."holding_lots" ADD CONSTRAINT "holding_lots_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "pockit"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."holding_lots" ADD CONSTRAINT "holding_lots_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."holdings" ADD CONSTRAINT "holdings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."import_candidates" ADD CONSTRAINT "import_candidates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."import_candidates" ADD CONSTRAINT "import_candidates_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "pockit"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."import_candidates" ADD CONSTRAINT "import_candidates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "pockit"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."import_candidates" ADD CONSTRAINT "import_candidates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."import_candidates" ADD CONSTRAINT "import_candidates_duplicate_of_transaction_id_transactions_id_fk" FOREIGN KEY ("duplicate_of_transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."import_candidates" ADD CONSTRAINT "import_candidates_created_transaction_id_transactions_id_fk" FOREIGN KEY ("created_transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."imports" ADD CONSTRAINT "imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."imports" ADD CONSTRAINT "imports_file_id_uploaded_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "pockit"."uploaded_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."imports" ADD CONSTRAINT "imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "pockit"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."insights" ADD CONSTRAINT "insights_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."invoice_items" ADD CONSTRAINT "invoice_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "pockit"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "pockit"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."invoices" ADD CONSTRAINT "invoices_paid_transaction_id_transactions_id_fk" FOREIGN KEY ("paid_transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."job_runs" ADD CONSTRAINT "job_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."liabilities" ADD CONSTRAINT "liabilities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."liabilities" ADD CONSTRAINT "liabilities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."merchant_rules" ADD CONSTRAINT "merchant_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."merchant_rules" ADD CONSTRAINT "merchant_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "pockit"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."merchant_rules" ADD CONSTRAINT "merchant_rules_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "pockit"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."merchants" ADD CONSTRAINT "merchants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."merchants" ADD CONSTRAINT "merchants_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "pockit"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."mileage_logs" ADD CONSTRAINT "mileage_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."mileage_logs" ADD CONSTRAINT "mileage_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "pockit"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."notification_rules" ADD CONSTRAINT "notification_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "pockit"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."receipt_items" ADD CONSTRAINT "receipt_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "pockit"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."receipts" ADD CONSTRAINT "receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."receipts" ADD CONSTRAINT "receipts_file_id_uploaded_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "pockit"."uploaded_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_series_id_recurring_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "pockit"."recurring_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_actual_transaction_id_transactions_id_fk" FOREIGN KEY ("actual_transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."recurring_series" ADD CONSTRAINT "recurring_series_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."recurring_series" ADD CONSTRAINT "recurring_series_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "pockit"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."recurring_series" ADD CONSTRAINT "recurring_series_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "pockit"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."recurring_series" ADD CONSTRAINT "recurring_series_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."saved_views" ADD CONSTRAINT "saved_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "pockit"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "pockit"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transaction_splits" ADD CONSTRAINT "transaction_splits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "pockit"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "pockit"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "pockit"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "pockit"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "pockit"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "pockit"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transactions" ADD CONSTRAINT "transactions_recurring_series_id_recurring_series_id_fk" FOREIGN KEY ("recurring_series_id") REFERENCES "pockit"."recurring_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "pockit"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transactions" ADD CONSTRAINT "transactions_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "pockit"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "pockit"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."uploaded_files" ADD CONSTRAINT "uploaded_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."uploaded_files" ADD CONSTRAINT "uploaded_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "pockit"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "pockit"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."vendors" ADD CONSTRAINT "vendors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."vendors" ADD CONSTRAINT "vendors_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "pockit"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "pockit"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "pockit"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pockit"."workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "pockit"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_account_date_key" ON "pockit"."account_balance_anchors" USING btree ("account_id","as_of");--> statement-breakpoint
CREATE INDEX "accounts_workspace_idx" ON "pockit"."accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ai_extractions_workspace_idx" ON "pockit"."ai_extractions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_workspace_idx" ON "pockit"."assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_idx" ON "pockit"."audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "pockit"."audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "budget_allocations_budget_idx" ON "pockit"."budget_allocations" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "budgets_workspace_idx" ON "pockit"."budgets" USING btree ("workspace_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_workspace_slug_key" ON "pockit"."categories" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "pockit"."categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "customers_workspace_idx" ON "pockit"."customers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "debt_payments_debt_idx" ON "pockit"."debt_payments" USING btree ("debt_id","paid_on");--> statement-breakpoint
CREATE INDEX "debts_workspace_idx" ON "pockit"."debts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_pair_date_key" ON "pockit"."fx_rates" USING btree ("base","quote","as_of");--> statement-breakpoint
CREATE INDEX "goal_contributions_goal_idx" ON "pockit"."goal_contributions" USING btree ("goal_id","occurred_on");--> statement-breakpoint
CREATE INDEX "goals_workspace_idx" ON "pockit"."goals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "holding_lots_holding_idx" ON "pockit"."holding_lots" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "holdings_workspace_idx" ON "pockit"."holdings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "candidates_import_idx" ON "pockit"."import_candidates" USING btree ("import_id","sort_order");--> statement-breakpoint
CREATE INDEX "imports_workspace_idx" ON "pockit"."imports" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "insights_workspace_idx" ON "pockit"."insights" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "insights_dedupe_key" ON "pockit"."insights" USING btree ("workspace_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "pockit"."invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_workspace_number_key" ON "pockit"."invoices" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX "invoices_workspace_status_idx" ON "pockit"."invoices" USING btree ("workspace_id","status","due_date");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "pockit"."job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "liabilities_workspace_idx" ON "pockit"."liabilities" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "merchant_rules_workspace_idx" ON "pockit"."merchant_rules" USING btree ("workspace_id","is_active","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_workspace_normalized_key" ON "pockit"."merchants" USING btree ("workspace_id","normalized_name");--> statement-breakpoint
CREATE INDEX "mileage_workspace_idx" ON "pockit"."mileage_logs" USING btree ("workspace_id","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "networth_workspace_date_key" ON "pockit"."net_worth_snapshots" USING btree ("workspace_id","as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_rules_ws_kind_key" ON "pockit"."notification_rules" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key" ON "pockit"."notifications" USING btree ("workspace_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_workspace_idx" ON "pockit"."notifications" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "receipt_items_receipt_idx" ON "pockit"."receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipts_workspace_idx" ON "pockit"."receipts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_series_date_key" ON "pockit"."recurring_occurrences" USING btree ("series_id","expected_date");--> statement-breakpoint
CREATE INDEX "recurring_workspace_idx" ON "pockit"."recurring_series" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "saved_views_workspace_idx" ON "pockit"."saved_views" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "pockit"."sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "pockit"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_key" ON "pockit"."tags" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "splits_transaction_idx" ON "pockit"."transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "tx_ws_date_idx" ON "pockit"."transactions" USING btree ("workspace_id","posted_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tx_ws_cat_date_idx" ON "pockit"."transactions" USING btree ("workspace_id","category_id","posted_date");--> statement-breakpoint
CREATE INDEX "tx_ws_acct_date_idx" ON "pockit"."transactions" USING btree ("workspace_id","account_id","posted_date");--> statement-breakpoint
CREATE INDEX "tx_ws_merchant_idx" ON "pockit"."transactions" USING btree ("workspace_id","merchant_id");--> statement-breakpoint
CREATE INDEX "tx_ws_amount_date_idx" ON "pockit"."transactions" USING btree ("workspace_id","amount_minor","posted_date");--> statement-breakpoint
CREATE INDEX "tx_transfer_group_idx" ON "pockit"."transactions" USING btree ("transfer_group_id");--> statement-breakpoint
CREATE INDEX "tx_import_idx" ON "pockit"."transactions" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "tx_recurring_idx" ON "pockit"."transactions" USING btree ("recurring_series_id");--> statement-breakpoint
CREATE INDEX "uploaded_files_workspace_idx" ON "pockit"."uploaded_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "uploaded_files_hash_idx" ON "pockit"."uploaded_files" USING btree ("workspace_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_key" ON "pockit"."users" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "vendors_workspace_idx" ON "pockit"."vendors" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "pockit"."workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_idx" ON "pockit"."workspaces" USING btree ("owner_user_id");
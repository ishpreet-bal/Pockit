-- Manual recurring schedules, and the relaxations needed for a simpler category UX.

-- Columns for user-created schedules. Detected series populate the existing columns;
-- these carry what only a hand-entered schedule knows.
ALTER TABLE pockit.recurring_series
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS interval_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outflow';

CREATE INDEX IF NOT EXISTS recurring_manual_idx
  ON pockit.recurring_series (workspace_id, is_manual)
  WHERE is_manual = true;

--> statement-breakpoint

-- Drop the leaf-only restriction on transaction categories.
--
-- It was added to stop a parent's total double-counting its children, but the rollup
-- walks upward from each transaction's own category, so a transaction posted directly
-- to "Food" and another posted to "Food > Groceries" already sum correctly.
--
-- The restriction had a real cost: it forced every user to pick from ~60 leaves when
-- most people just want "Food". Choosing between too many options is exactly what
-- makes people give up and select nothing.
DROP TRIGGER IF EXISTS tx_leaf_category_guard ON pockit.transactions;
DROP FUNCTION IF EXISTS pockit.assert_leaf_category();

--> statement-breakpoint

-- Mark which categories are shown first. Everything else stays available behind
-- "more", so power users keep the detail without new users drowning in it.
ALTER TABLE pockit.categories
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

UPDATE pockit.categories SET is_primary = true WHERE parent_id IS NULL;

--> statement-breakpoint

-- Budget setup answers, so the guided flow can explain its recommendation later.
ALTER TABLE pockit.budgets
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS setup_answers jsonb;

-- What the user told us during onboarding, used to give value before any history exists.
ALTER TABLE pockit.user_profiles
  ADD COLUMN IF NOT EXISTS primary_intent text,
  ADD COLUMN IF NOT EXISTS experience_level text NOT NULL DEFAULT 'simple';

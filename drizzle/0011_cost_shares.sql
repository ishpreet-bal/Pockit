-- Split expenses: a purchase you paid for that was partly, or wholly, someone else's.
--
-- Personal to the person who paid, like a private Splitwise: nobody else needs an
-- account. Only your own share counts as your spending; the rest is shown as owed
-- to you until it comes back.
--
-- What is stored is the choice (split N ways, or paid for someone), never the
-- resulting amounts, so a bank that later corrects the purchase amount (a pending
-- charge settling for a different total) moves the shares with it.

CREATE TABLE IF NOT EXISTS pockit.cost_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL UNIQUE REFERENCES pockit.transactions(id) ON DELETE CASCADE,
  -- 'split': shared between `people` (you included). 'covered': you paid for someone else.
  kind text NOT NULL CHECK (kind IN ('split', 'covered')),
  people integer CHECK (people IS NULL OR (people BETWEEN 2 AND 50)),
  -- An uneven split: your part, in the purchase's base currency. Null means even.
  mine_minor bigint CHECK (mine_minor IS NULL OR mine_minor >= 0),
  -- Whether the others' part is coming back to you. A covered purchase you are not
  -- getting back is a treat, and stays your spending.
  expect_back boolean NOT NULL DEFAULT true,
  with_whom text CHECK (with_whom IS NULL OR length(with_whom) <= 200),
  settled_at timestamptz,
  created_by uuid REFERENCES pockit.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'covered' OR people IS NOT NULL)
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS cost_shares_ws_idx ON pockit.cost_shares (workspace_id, settled_at);

--> statement-breakpoint

-- Money coming back. When it arrived as a deposit Pockit can see, the deposit is
-- linked so it is not counted as income: being paid back is not earning.
CREATE TABLE IF NOT EXISTS pockit.cost_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  cost_share_id uuid NOT NULL REFERENCES pockit.cost_shares(id) ON DELETE CASCADE,
  transaction_id uuid UNIQUE REFERENCES pockit.transactions(id) ON DELETE SET NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  received_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS cost_repayments_share_idx ON pockit.cost_repayments (cost_share_id);

--> statement-breakpoint

ALTER TABLE pockit.cost_shares ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE pockit.cost_shares FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE pockit.cost_repayments ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE pockit.cost_repayments FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY cost_shares_workspace_isolation ON pockit.cost_shares
    USING (pockit.can_access_workspace(workspace_id)) WITH CHECK (pockit.can_access_workspace(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY cost_repayments_workspace_isolation ON pockit.cost_repayments
    USING (pockit.can_access_workspace(workspace_id)) WITH CHECK (pockit.can_access_workspace(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

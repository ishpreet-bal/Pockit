-- Split with friends, the other direction: money YOU owe someone.
--
-- 0011 covers a purchase you paid for and others owe you part of. This is a
-- purchase someone else paid for, where you owe them your part. Like the rest of
-- splitting it is personal: the friend needs no account.
--
-- Your part is your spending the day it happened, so it is booked straight away as
-- an expense (`transaction_id`) and your budget is right on the day. When you pay
-- them back from your bank, that payment is linked (`settle_transaction_id`) and
-- stops counting as spending, so the dinner is never counted twice.

CREATE TABLE IF NOT EXISTS pockit.iou_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  person text NOT NULL CHECK (length(person) BETWEEN 1 AND 80),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 200),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  transaction_id uuid NOT NULL UNIQUE REFERENCES pockit.transactions(id) ON DELETE CASCADE,
  settled_at timestamptz,
  settle_transaction_id uuid UNIQUE REFERENCES pockit.transactions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES pockit.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- Who a payback on a split came from, so "Sam paid me back" clears Sam and not
-- half of Sam and half of Priya. Null for paybacks recorded for the whole split.
ALTER TABLE pockit.cost_repayments ADD COLUMN IF NOT EXISTS person text CHECK (person IS NULL OR length(person) <= 80);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS iou_debts_ws_idx ON pockit.iou_debts (workspace_id, settled_at);

--> statement-breakpoint

ALTER TABLE pockit.iou_debts ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE pockit.iou_debts FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY iou_debts_workspace_isolation ON pockit.iou_debts
    USING (pockit.can_access_workspace(workspace_id)) WITH CHECK (pockit.can_access_workspace(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

-- The role requests run under (0012 pockit_app, or 0016 authenticated) gets the new
-- table through default privileges only when this connection created those defaults;
-- grant explicitly so it never depends on that.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pockit_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON pockit.iou_debts TO pockit_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AND has_schema_privilege('authenticated', 'pockit', 'USAGE') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON pockit.iou_debts TO authenticated;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

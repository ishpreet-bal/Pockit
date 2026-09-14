-- Integrity and isolation guarantees enforced by the database itself, so that an
-- application bug cannot corrupt a ledger or leak across workspaces.
-- See docs/03-schema.md §3.4.

-- Case-insensitive, accent-tolerant merchant and description search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS tx_description_trgm_idx
  ON pockit.transactions USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tx_merchant_name_trgm_idx
  ON pockit.transactions USING gin (merchant_name gin_trgm_ops);

-- The hot path is always "live rows in this workspace, newest first".
CREATE INDEX IF NOT EXISTS tx_live_ws_date_idx
  ON pockit.transactions (workspace_id, posted_date DESC)
  WHERE deleted_at IS NULL;

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 1. A transaction's workspace must match its account's workspace.
--    This blocks the cross-workspace leak in spec §49 at the storage layer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pockit.assert_transaction_workspace()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  account_ws uuid;
BEGIN
  SELECT workspace_id INTO account_ws FROM pockit.accounts WHERE id = NEW.account_id;
  IF account_ws IS NULL THEN
    RAISE EXCEPTION 'Account % does not exist', NEW.account_id;
  END IF;
  IF account_ws <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Workspace mismatch: transaction is in workspace % but account % belongs to %',
      NEW.workspace_id, NEW.account_id, account_ws;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tx_workspace_guard
  BEFORE INSERT OR UPDATE OF account_id, workspace_id ON pockit.transactions
  FOR EACH ROW EXECUTE FUNCTION pockit.assert_transaction_workspace();

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Transactions attach to LEAF categories only, so that rolling a parent
--    category up over its children can never double count (spec gap G4).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pockit.assert_leaf_category()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM pockit.categories
    WHERE parent_id = NEW.category_id AND is_archived = false
  ) THEN
    RAISE EXCEPTION 'Category % has subcategories; attach the transaction to a leaf category',
      NEW.category_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tx_leaf_category_guard
  BEFORE INSERT OR UPDATE OF category_id ON pockit.transactions
  FOR EACH ROW EXECUTE FUNCTION pockit.assert_leaf_category();

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Splits must sum EXACTLY to the parent transaction amount (spec §43).
--    Deferred to the end of the statement so a multi-row rewrite is legal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pockit.assert_splits_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  tx_id uuid;
  parent_amount bigint;
  split_total bigint;
  split_count int;
BEGIN
  tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT amount_minor INTO parent_amount
    FROM pockit.transactions WHERE id = tx_id;
  IF parent_amount IS NULL THEN
    RETURN NULL; -- parent already gone (cascade delete)
  END IF;

  SELECT COALESCE(SUM(amount_minor), 0), COUNT(*)
    INTO split_total, split_count
    FROM pockit.transaction_splits WHERE transaction_id = tx_id;

  -- Zero splits is valid: the transaction simply is not split.
  IF split_count > 0 AND split_total <> parent_amount THEN
    RAISE EXCEPTION
      'Split total (%) must equal the transaction amount (%) for transaction %',
      split_total, parent_amount, tx_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER splits_balance_guard
  AFTER INSERT OR UPDATE OR DELETE ON pockit.transaction_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pockit.assert_splits_balance();

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. updated_at maintenance, so "last changed" is always truthful.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pockit.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'pockit' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON pockit.%I FOR EACH ROW EXECUTE FUNCTION pockit.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  END LOOP;
END;
$$;

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Row Level Security — defence in depth behind the application's own
--    workspace scoping. Either layer alone is one bug away from a leak.
--
--    The application sets `pockit.user_id` per connection checkout. If it is
--    unset, these policies deny everything rather than falling open.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pockit.current_user_id()
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  v := current_setting('pockit.user_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pockit.can_access_workspace(ws uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT ws IS NOT NULL
     AND pockit.current_user_id() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pockit.workspace_members m
       WHERE m.workspace_id = ws AND m.user_id = pockit.current_user_id()
     );
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'pockit'
      AND c.column_name = 'workspace_id'
      AND tb.table_type = 'BASE TABLE'
      -- audit_logs and job_runs carry a NULLABLE workspace_id because they are
      -- written during sign-up and by cron, before any workspace context exists.
      -- They are server-only tables that no client query ever reaches, and the
      -- repository layer scopes every read of them by workspace.
      AND c.table_name NOT IN ('audit_logs', 'job_runs')
  LOOP
    EXECUTE format('ALTER TABLE pockit.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE pockit.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON pockit.%I USING (pockit.can_access_workspace(workspace_id)) WITH CHECK (pockit.can_access_workspace(workspace_id))',
      t || '_workspace_isolation', t
    );
  END LOOP;
END;
$$;

-- Workspaces themselves: visible to members only.
ALTER TABLE pockit.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspaces_member_access ON pockit.workspaces
  USING (pockit.can_access_workspace(id))
  WITH CHECK (owner_user_id = pockit.current_user_id());

-- Membership rows: a user sees only their own.
ALTER TABLE pockit.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.workspace_members FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_members_self ON pockit.workspace_members
  USING (user_id = pockit.current_user_id() OR pockit.can_access_workspace(workspace_id))
  WITH CHECK (user_id = pockit.current_user_id() OR pockit.can_access_workspace(workspace_id));

-- Per-user rows.
ALTER TABLE pockit.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.user_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_self ON pockit.user_profiles
  USING (user_id = pockit.current_user_id())
  WITH CHECK (user_id = pockit.current_user_id());

--> statement-breakpoint

-- Child tables reached only through a parent keep their parent's protection.
ALTER TABLE pockit.file_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.file_blobs FORCE ROW LEVEL SECURITY;
CREATE POLICY file_blobs_via_file ON pockit.file_blobs
  USING (EXISTS (
    SELECT 1 FROM pockit.uploaded_files f
    WHERE f.id = file_blobs.file_id AND pockit.can_access_workspace(f.workspace_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM pockit.uploaded_files f
    WHERE f.id = file_blobs.file_id AND pockit.can_access_workspace(f.workspace_id)
  ));

ALTER TABLE pockit.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.receipt_items FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_items_via_receipt ON pockit.receipt_items
  USING (EXISTS (
    SELECT 1 FROM pockit.receipts r
    WHERE r.id = receipt_items.receipt_id AND pockit.can_access_workspace(r.workspace_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM pockit.receipts r
    WHERE r.id = receipt_items.receipt_id AND pockit.can_access_workspace(r.workspace_id)
  ));

ALTER TABLE pockit.transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.transaction_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY transaction_tags_via_tx ON pockit.transaction_tags
  USING (EXISTS (
    SELECT 1 FROM pockit.transactions x
    WHERE x.id = transaction_tags.transaction_id AND pockit.can_access_workspace(x.workspace_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM pockit.transactions x
    WHERE x.id = transaction_tags.transaction_id AND pockit.can_access_workspace(x.workspace_id)
  ));

--> statement-breakpoint

-- receipts.customer_id is declared without a foreign key in the Drizzle schema to
-- avoid a forward reference; add the constraint here now that customers exists.
ALTER TABLE pockit.receipts
  ADD CONSTRAINT receipts_customer_id_fk
  FOREIGN KEY (customer_id) REFERENCES pockit.customers(id) ON DELETE SET NULL;

-- Both legs of a transfer must exist; index the group so pairing is cheap.
CREATE INDEX IF NOT EXISTS tx_transfer_group_live_idx
  ON pockit.transactions (transfer_group_id)
  WHERE transfer_group_id IS NOT NULL AND deleted_at IS NULL;

-- A refund points at the purchase it reverses.
ALTER TABLE pockit.transactions
  ADD CONSTRAINT transactions_offsets_fk
  FOREIGN KEY (offsets_transaction_id) REFERENCES pockit.transactions(id) ON DELETE SET NULL;

-- Category tree self-reference.
ALTER TABLE pockit.categories
  ADD CONSTRAINT categories_parent_fk
  FOREIGN KEY (parent_id) REFERENCES pockit.categories(id) ON DELETE CASCADE;

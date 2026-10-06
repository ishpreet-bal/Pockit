-- Bank connections (Plaid).
--
-- One row per bank login a person connects. The Plaid access token is stored
-- encrypted (AES-256-GCM, key derived from AUTH_SECRET) — never in plain text —
-- and only the server ever reads it. `cursor` is Plaid's bookmark for
-- /transactions/sync so each sync fetches only what changed.

CREATE TABLE IF NOT EXISTS pockit.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'plaid',
  item_id text NOT NULL,
  access_token_enc text NOT NULL,
  institution_name text,
  cursor text,
  status text NOT NULL DEFAULT 'active',
  error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, item_id)
);

--> statement-breakpoint

ALTER TABLE pockit.bank_connections ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE pockit.bank_connections FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY bank_connections_workspace_isolation ON pockit.bank_connections
    USING (pockit.can_access_workspace(workspace_id)) WITH CHECK (pockit.can_access_workspace(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--> statement-breakpoint

-- A synced transaction remembers its bank-side id, so a sync can never insert it twice.
ALTER TABLE pockit.transactions ADD COLUMN IF NOT EXISTS external_id text;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS tx_ws_external_id_key
  ON pockit.transactions (workspace_id, external_id) WHERE external_id IS NOT NULL;

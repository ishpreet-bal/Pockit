-- Investing: a risk profile per workspace, and a watchlist.
--
-- Separate from `holdings` on purpose. A holding is something you own and that
-- counts towards net worth; a watchlist item is something you are only looking at.
-- Conflating them would put imaginary money into real totals.

CREATE TABLE IF NOT EXISTS pockit.investor_profiles (
  workspace_id uuid PRIMARY KEY REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  -- The raw answers, kept so the profile can be recomputed if the model changes
  -- rather than being silently stale.
  answers jsonb NOT NULL,
  level text NOT NULL,
  stocks_pct integer,
  bonds_pct integer,
  cash_pct integer,
  -- Consent is a timestamp, not a boolean: it records WHEN the disclaimers were
  -- accepted, so a change to their wording can require accepting again.
  disclaimer_accepted_at timestamptz NOT NULL,
  disclaimer_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS pockit.watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- One row per symbol per workspace: adding the same ticker twice is always a
-- mistake, and the database is the only place that can guarantee it.
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_items_workspace_symbol_idx
  ON pockit.watchlist_items (workspace_id, upper(symbol));

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS watchlist_items_workspace_idx
  ON pockit.watchlist_items (workspace_id);

--> statement-breakpoint

-- Same isolation as every other workspace-scoped table: a row is visible only to
-- members of its workspace, enforced in the database rather than in the query.
ALTER TABLE pockit.investor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.investor_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investor_profiles_workspace_isolation ON pockit.investor_profiles;
CREATE POLICY investor_profiles_workspace_isolation ON pockit.investor_profiles
  USING (pockit.can_access_workspace(workspace_id))
  WITH CHECK (pockit.can_access_workspace(workspace_id));

--> statement-breakpoint

ALTER TABLE pockit.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.watchlist_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS watchlist_items_workspace_isolation ON pockit.watchlist_items;
CREATE POLICY watchlist_items_workspace_isolation ON pockit.watchlist_items
  USING (pockit.can_access_workspace(workspace_id))
  WITH CHECK (pockit.can_access_workspace(workspace_id));

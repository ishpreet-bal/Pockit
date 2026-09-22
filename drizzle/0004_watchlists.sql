-- Named watchlists.
--
-- A watchlist was one flat pile per workspace. That is fine for five tickers and
-- useless for fifty: "things I might buy" and "things I am only curious about" are
-- different questions, and a single list cannot answer both.
--
-- Lists are a table rather than a `list_name` column on the item, so an empty list
-- can exist. Without a row of its own, creating "Long term" and then walking away
-- would leave nothing behind, and the name would silently vanish.

CREATE TABLE IF NOT EXISTS pockit.watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- Two lists called "ETFs" in one workspace is always a mistake. Compared
-- case-insensitively, because "etfs" and "ETFs" are the same list to the person
-- typing them.
CREATE UNIQUE INDEX IF NOT EXISTS watchlists_workspace_name_idx
  ON pockit.watchlists (workspace_id, lower(name));

--> statement-breakpoint

ALTER TABLE pockit.watchlist_items ADD COLUMN IF NOT EXISTS list_id uuid
  REFERENCES pockit.watchlists(id) ON DELETE CASCADE;

--> statement-breakpoint

-- The backfill runs with FORCE lifted. Migrations connect as the table owner with
-- no workspace set on the session, so every policy check would evaluate false and
-- the UPDATE below would report success having moved nothing — the worst possible
-- outcome, because the NOT NULL two steps later would then fail on live data.
ALTER TABLE pockit.watchlist_items NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

INSERT INTO pockit.watchlists (workspace_id, name, position)
SELECT DISTINCT w.workspace_id, 'Watchlist', 0
FROM pockit.watchlist_items w
ON CONFLICT DO NOTHING;

--> statement-breakpoint

UPDATE pockit.watchlist_items i
SET list_id = l.id
FROM pockit.watchlists l
WHERE l.workspace_id = i.workspace_id
  AND lower(l.name) = 'watchlist'
  AND i.list_id IS NULL;

--> statement-breakpoint

ALTER TABLE pockit.watchlist_items ALTER COLUMN list_id SET NOT NULL;

--> statement-breakpoint

ALTER TABLE pockit.watchlist_items FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Uniqueness moves from the workspace to the list. The same ticker on both
-- "Long term" and "Research" is a reasonable thing to want; the same ticker twice
-- on one list still is not.
DROP INDEX IF EXISTS pockit.watchlist_items_workspace_symbol_idx;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS watchlist_items_list_symbol_idx
  ON pockit.watchlist_items (list_id, upper(symbol));

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS watchlists_workspace_idx ON pockit.watchlists (workspace_id);

--> statement-breakpoint

ALTER TABLE pockit.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.watchlists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS watchlists_workspace_isolation ON pockit.watchlists;
CREATE POLICY watchlists_workspace_isolation ON pockit.watchlists
  USING (pockit.can_access_workspace(workspace_id))
  WITH CHECK (pockit.can_access_workspace(workspace_id));

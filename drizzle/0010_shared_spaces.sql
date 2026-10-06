-- Shared spaces: a household budget two or more people can see and add to.
--
-- A shared space is just another workspace (kind 'household') with more than one
-- member, so every existing protection applies unchanged: row-level security
-- already limits each row to the members of its workspace.

ALTER TYPE pockit.workspace_kind ADD VALUE IF NOT EXISTS 'household';

--> statement-breakpoint

-- Invite codes: short, single-use, expire after a week. Looked up only by the
-- server when someone joins; a code reveals nothing on its own.
CREATE TABLE IF NOT EXISTS pockit.space_invites (
  code text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES pockit.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES pockit.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

ALTER TABLE pockit.space_invites ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE pockit.space_invites FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY space_invites_workspace_isolation ON pockit.space_invites
    USING (pockit.can_access_workspace(workspace_id)) WITH CHECK (pockit.can_access_workspace(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

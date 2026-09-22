-- Two-factor authentication, feedback, and Pock's memory.
--
-- Three features, one migration, because they share the same shape: rows that
-- belong to a person rather than to a workspace, and rows that must never leak
-- across either boundary.

-- ---------------------------------------------------------------------------
-- Two-factor authentication
-- ---------------------------------------------------------------------------

-- The shared secret is stored ENCRYPTED, not in the clear. A password hash cannot
-- be reversed, so a leaked users table costs attackers a cracking run; a TOTP
-- secret in the clear is immediately usable as the second factor, which would make
-- the whole feature theatre. Encryption uses AUTH_SECRET-derived AES-256-GCM, so
-- the database alone is not enough.
CREATE TABLE IF NOT EXISTS pockit.user_totp (
  user_id uuid PRIMARY KEY REFERENCES pockit.users(id) ON DELETE CASCADE,
  secret_encrypted text NOT NULL,
  -- Null until the first correct code proves the authenticator actually works.
  -- Enrolling without this step is how people lock themselves out permanently.
  confirmed_at timestamptz,
  -- Which 30-second step was last accepted, so a stolen code cannot be replayed
  -- inside its own validity window.
  last_used_step bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- Recovery codes are HASHED, like passwords. They are password-equivalent: anyone
-- holding one can bypass the second factor.
CREATE TABLE IF NOT EXISTS pockit.recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES pockit.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS recovery_codes_user_idx ON pockit.recovery_codes (user_id);

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pockit.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL rather than CASCADE: someone deleting their account should not also
  -- delete the bug report that would stop the next person hitting the same thing.
  user_id uuid REFERENCES pockit.users(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES pockit.workspaces(id) ON DELETE SET NULL,
  kind text NOT NULL,
  message text NOT NULL,
  -- Which screen they were on. Saves the round trip of asking.
  page text,
  -- Whether they agreed to be contacted about it. Default is no.
  contact_ok boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS feedback_created_idx ON pockit.feedback (created_at DESC);

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Ask Pock
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pockit.pock_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES pockit.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  -- The symbol the conversation started from, when it started from one. Lets an
  -- asset page show "you asked about this before" instead of starting cold.
  symbol text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS pockit.pock_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES pockit.pock_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES pockit.workspaces(id) ON DELETE CASCADE,
  role text NOT NULL,
  body text NOT NULL,
  -- What the answer was actually grounded in, kept so a claim can be audited
  -- later rather than taken on trust.
  facts jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS pock_threads_workspace_idx ON pockit.pock_threads (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS pock_messages_thread_idx ON pockit.pock_messages (thread_id, created_at);

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

-- Workspace-scoped tables get the same policy as every other one.
ALTER TABLE pockit.pock_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.pock_threads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pock_threads_workspace_isolation ON pockit.pock_threads;
CREATE POLICY pock_threads_workspace_isolation ON pockit.pock_threads
  USING (pockit.can_access_workspace(workspace_id))
  WITH CHECK (pockit.can_access_workspace(workspace_id));

--> statement-breakpoint

ALTER TABLE pockit.pock_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.pock_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pock_messages_workspace_isolation ON pockit.pock_messages;
CREATE POLICY pock_messages_workspace_isolation ON pockit.pock_messages
  USING (pockit.can_access_workspace(workspace_id))
  WITH CHECK (pockit.can_access_workspace(workspace_id));

--> statement-breakpoint

-- The 2FA tables are USER-scoped, not workspace-scoped, so they need their own
-- predicate: a row is yours if it is about you. Sharing a workspace with someone
-- must not expose how they secure their account.
ALTER TABLE pockit.user_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.user_totp FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_totp_self_only ON pockit.user_totp;
CREATE POLICY user_totp_self_only ON pockit.user_totp
  USING (user_id = pockit.current_user_id())
  WITH CHECK (user_id = pockit.current_user_id());

--> statement-breakpoint

ALTER TABLE pockit.recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.recovery_codes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recovery_codes_self_only ON pockit.recovery_codes;
CREATE POLICY recovery_codes_self_only ON pockit.recovery_codes
  USING (user_id = pockit.current_user_id())
  WITH CHECK (user_id = pockit.current_user_id());

--> statement-breakpoint

-- Feedback is write-mostly and deliberately NOT readable from the app: there is no
-- screen that lists it, and RLS makes that structural rather than a matter of
-- nobody having written the query yet. Inserts are allowed for your own rows.
ALTER TABLE pockit.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockit.feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_insert_own ON pockit.feedback;
CREATE POLICY feedback_insert_own ON pockit.feedback
  FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = pockit.current_user_id());

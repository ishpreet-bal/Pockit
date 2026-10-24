-- Password reset links.
--
-- Only a hash of each token is stored, so a database leak yields no usable links.
-- A link works once, for an hour. Row-level security is on with no policies: only
-- the privileged connection used before anyone is signed in can read or write it.

CREATE TABLE IF NOT EXISTS pockit.password_resets (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES pockit.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON pockit.password_resets (user_id);

--> statement-breakpoint

ALTER TABLE pockit.password_resets ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE pockit.password_resets FORCE ROW LEVEL SECURITY;

-- Guest accounts: "Look around first" without signing up.
--
-- A guest is an ordinary account (so every screen, rule and protection works
-- unchanged) with sample money and no real email. It is deleted after a few days
-- by /api/cron/purge-guests, or straight away when the person creates a real one.

ALTER TABLE pockit.users ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS users_guest_created_idx ON pockit.users (created_at) WHERE is_guest;

-- First-run onboarding, persisted server-side.
--
-- The existing `onboarding_step` integer was enough for a wizard that runs once in
-- one sitting. It cannot answer "what has this person actually told us", which is
-- what resuming halfway through requires — a step number says where they were, not
-- what was saved.
--
-- So: a named stage, and the answers themselves. Both on the server, because a
-- browser closed mid-flow takes localStorage's version of the truth with it.

ALTER TABLE pockit.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_stage text NOT NULL DEFAULT 'not_started';

--> statement-breakpoint

-- The answers so far, saved after every screen rather than at the end. Shaped, not
-- free-form: see lib/onboarding/state.ts, which validates it on read so a row
-- written by an older build cannot crash a newer one.
ALTER TABLE pockit.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_answers jsonb NOT NULL DEFAULT '{}'::jsonb;

--> statement-breakpoint

ALTER TABLE pockit.user_profiles
  ADD COLUMN IF NOT EXISTS tour_completed_at timestamptz;

--> statement-breakpoint

-- EVERY profile that already exists is marked done, including ones that never
-- finished the old wizard.
--
-- The temptation is to treat a half-finished old wizard as "mid-flight" and resume
-- it. That is wrong. Those people have been using the app for weeks — there was no
-- gate before this migration — and a deploy that suddenly blocks the dashboard
-- behind a questionnaire is indistinguishable from a bug, or from data loss.
--
-- First-run belongs to accounts created AFTER this ships. Anyone here already is,
-- by definition, not a first-run user.
UPDATE pockit.user_profiles SET onboarding_stage = 'done';

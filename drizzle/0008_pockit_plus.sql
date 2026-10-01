-- Pockit Plus: who has it, until when, and where it came from.
--
-- `plus_until` rather than a boolean, because a subscription is a period: it runs
-- out on its own if a renewal never arrives, without a job having to notice. A
-- cancelled subscription keeps working until the end of what was paid for, which
-- is what people expect and what the App Store requires.

ALTER TABLE pockit.user_profiles
  ADD COLUMN IF NOT EXISTS plus_until timestamptz;

--> statement-breakpoint

-- 'app_store' (via RevenueCat) or 'manual' (granted by hand, e.g. for testers).
ALTER TABLE pockit.user_profiles
  ADD COLUMN IF NOT EXISTS plus_source text;

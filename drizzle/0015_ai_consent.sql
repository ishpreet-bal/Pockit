-- Permission to send personal data to the AI provider (App Store guideline
-- 5.1.2(i), November 2025: disclose and ask before sharing personal data with a
-- third-party AI). The provider is recorded with the answer, so switching from one
-- AI company to another asks again.

ALTER TABLE pockit.user_profiles ADD COLUMN IF NOT EXISTS ai_consent_at timestamptz;

--> statement-breakpoint

ALTER TABLE pockit.user_profiles ADD COLUMN IF NOT EXISTS ai_consent_provider text;

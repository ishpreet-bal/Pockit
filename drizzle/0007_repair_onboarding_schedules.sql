-- Repair schedules created by the first version of onboarding.
--
-- That version wrote income without setting `direction`, whose column default is
-- 'outflow' — so income rendered as a negative expense. It also wrote no start
-- date, so every schedule fell back to TODAY and read "due today".

-- FORCE is lifted for the repair and restored after. Migrations connect as the
-- table owner with no workspace on the session, so under FORCE every policy check
-- is false and both statements below would report success having changed nothing.
ALTER TABLE pockit.recurring_series NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Income is money coming in. Any manual income row still marked outflow is wrong
-- by construction; nothing a person could have typed produces that combination.
UPDATE pockit.recurring_series
SET direction = 'inflow'
WHERE type = 'income'
  AND direction = 'outflow'
  AND is_manual = true;

--> statement-breakpoint

-- Setup could also run twice on a double-click, creating every row twice. Rows that
-- are identical in every field that matters AND were created within a minute of
-- each other are the same row written twice, not two real bills — keep the first.
-- Deliberately narrow: two genuine $15 subscriptions added on different days are
-- untouched.
DELETE FROM pockit.recurring_series dup
USING pockit.recurring_series keep
WHERE dup.is_manual = true
  AND keep.is_manual = true
  AND dup.workspace_id = keep.workspace_id
  AND dup.name = keep.name
  AND dup.amount_minor = keep.amount_minor
  AND dup.cadence = keep.cadence
  AND dup.type = keep.type
  AND dup.id <> keep.id
  AND dup.created_at > keep.created_at
  AND dup.created_at - keep.created_at < interval '60 seconds';

--> statement-breakpoint

ALTER TABLE pockit.recurring_series FORCE ROW LEVEL SECURITY;

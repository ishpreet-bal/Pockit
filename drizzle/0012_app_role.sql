-- Make row-level security actually apply.
--
-- Hosted Postgres usually connects as a role that bypasses RLS (Supabase's
-- `postgres` does), so the policies in 0001 were written but never enforced: a
-- missing `WHERE workspace_id = ...` in application code would have been the only
-- thing between one person's records and another's.
--
-- `pockit_app` is an ordinary role that cannot bypass RLS. Every request that runs
-- on behalf of a person (withUser) switches to it for that transaction, so the
-- policies hold even if the application code is wrong. The few privileged steps
-- (sign-up, sign-in, migrations) keep the connecting role.

-- Some hosts refuse CREATE ROLE outright (a "restricted superuser"), and some let the
-- connecting role create it but not grant it to itself. Neither may stop setup: every
-- step that needs the role runs only once the role exists and this connection may
-- use it, and otherwise the database stays as it was before this migration. The app
-- checks the same thing (canEnforceRls) and carries on as the connecting role.
DO $$
BEGIN
  BEGIN
    CREATE ROLE pockit_app NOLOGIN NOBYPASSRLS;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN OTHERS THEN
      RAISE NOTICE 'pockit_app not created (%); row-level security stays with the connecting role', SQLERRM;
      RETURN;
  END;

  -- The connecting role may switch into it.
  BEGIN
    EXECUTE 'GRANT pockit_app TO ' || quote_ident(current_user);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pockit_app not granted to % (%)', current_user, SQLERRM;
  END;

  GRANT USAGE ON SCHEMA pockit TO pockit_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pockit TO pockit_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pockit TO pockit_app;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pockit TO pockit_app;
  -- Tables and functions added by later migrations get the same grants.
  ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pockit_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT USAGE, SELECT ON SEQUENCES TO pockit_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT EXECUTE ON FUNCTIONS TO pockit_app;
END $$;

--> statement-breakpoint

-- The access check reads workspace_members, whose own policy calls the access
-- check: under an RLS-bound role that recursion never ends ("stack depth limit
-- exceeded"). Running the check as its owner breaks the loop. It still answers only
-- about the user bound to this transaction, so it grants nothing new.
CREATE OR REPLACE FUNCTION pockit.can_access_workspace(ws uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pockit, pg_temp AS $$
  SELECT ws IS NOT NULL
     AND pockit.current_user_id() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pockit.workspace_members m
       WHERE m.workspace_id = ws AND m.user_id = pockit.current_user_id()
     );
$$;

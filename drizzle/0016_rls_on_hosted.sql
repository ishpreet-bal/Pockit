-- Row-level security where Pockit may not create its own role.
--
-- Some hosted databases refuse CREATE ROLE ("restricted superuser cannot create
-- roles"), so 0012 could not make `pockit_app`, and every request ran as the
-- connecting role, which bypasses row-level security. The policies were written but
-- only the application's own filters kept one person's records from another's.
--
-- Supabase already has a role that cannot bypass row-level security and that the
-- connecting role may switch into: `authenticated`. Granting it what `pockit_app`
-- would have had lets requests run under it (src/lib/db/client.ts chooses it only
-- once these grants exist), so the database enforces the policies again.
--
-- The pockit schema is not exposed through Supabase's REST API, and the policies
-- read `pockit.user_id`, which only Pockit's server sets, so this opens nothing to
-- anyone signing in through Supabase itself.
--
-- Where `pockit_app` works, or there is no `authenticated` role, this does nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pockit_app' AND pg_has_role(current_user, oid, 'MEMBER')) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated' AND NOT rolbypassrls AND NOT rolsuper) THEN
    RETURN;
  END IF;
  IF NOT pg_has_role(current_user, 'authenticated', 'MEMBER') THEN
    RAISE NOTICE 'Cannot switch to authenticated; row-level security stays with the connecting role';
    RETURN;
  END IF;

  GRANT USAGE ON SCHEMA pockit TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pockit TO authenticated;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pockit TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pockit TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT EXECUTE ON FUNCTIONS TO authenticated;
END $$;

-- Row-level security on hosted databases, second try.
--
-- 0016 granted Supabase's `authenticated` role what Pockit needs, but only when the
-- connecting role could already switch to it. Some projects connect as a role that
-- isn't a member of `authenticated` yet; where this connection may grant that
-- membership (it holds the admin option, as Supabase's postgres does on many
-- projects), grant it, then the same table access as 0016. Where neither works this
-- changes nothing, and /api/health shows which condition is missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pockit_app' AND pg_has_role(current_user, oid, 'MEMBER')) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated' AND NOT rolbypassrls AND NOT rolsuper) THEN
    RETURN;
  END IF;
  -- Membership, with the right to SET ROLE (Postgres 16 separates the two).
  BEGIN
    EXECUTE 'GRANT authenticated TO ' || quote_ident(current_user) || ' WITH SET TRUE';
  EXCEPTION WHEN syntax_error THEN
    BEGIN
      EXECUTE 'GRANT authenticated TO ' || quote_ident(current_user);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not join authenticated (%); row-level security stays with the app', SQLERRM;
      RETURN;
    END;
  WHEN OTHERS THEN
    IF NOT pg_has_role(current_user, 'authenticated', 'MEMBER') THEN
      RAISE NOTICE 'Could not join authenticated (%); row-level security stays with the app', SQLERRM;
      RETURN;
    END IF;
  END;
  BEGIN
    GRANT USAGE ON SCHEMA pockit TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pockit TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pockit TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pockit TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA pockit GRANT EXECUTE ON FUNCTIONS TO authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant table access to authenticated (%)', SQLERRM;
  END;
END $$;

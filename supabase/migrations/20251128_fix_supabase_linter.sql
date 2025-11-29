-- Fix Supabase linter findings (RLS + function search_path)
-- Run on STAGING first. Review output before running in PRODUCTION.
-- This script is idempotent where possible and safe to re-run.

-- 1) Enable RLS on public.embedding_backfill_jobs (if present)
--    and create a tenant-isolation policy only if the table contains a tenant_id column.

BEGIN;

-- Enable RLS (idempotent)
ALTER TABLE IF EXISTS public.embedding_backfill_jobs ENABLE ROW LEVEL SECURITY;

-- Create a tenant-isolation policy only if tenant_id exists and policy not present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'embedding_backfill_jobs' AND relnamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='embedding_backfill_jobs' AND column_name='tenant_id') THEN
      RAISE NOTICE 'Table public.embedding_backfill_jobs exists but has no tenant_id column; skipping tenant isolation policy creation.';
    ELSE
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='embedding_backfill_jobs' AND policyname='embedding_backfill_jobs_tenant_isolation') THEN
        EXECUTE $sql$
          CREATE POLICY embedding_backfill_jobs_tenant_isolation
          ON public.embedding_backfill_jobs
          USING (tenant_id = current_setting(''app.current_tenant'')::text)
          WITH CHECK (tenant_id = current_setting(''app.current_tenant'')::text);
        $sql$;
      END IF;
    END IF;
  END IF;
END$$;

-- 2) Set a stable search_path for user-facing functions in public
--    This addresses Supabase linter warnings about mutable search_path.
--    The script iterates a conservative list of functions previously flagged by the linter.

DO $$
DECLARE
  r RECORD;
  target_names TEXT[] := ARRAY[
    'increment_tenant_usage',
    'match_embeddings_by_tenant',
    'match_embeddings_by_tenant_768',
    'update_updated_at_column',
    'update_session_activity',
    'cleanup_expired_admin_tokens',
    'check_tenant_quota',
    'set_tenant_context',
    'cleanup_expired_sessions'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = ANY(target_names)
  LOOP
    -- Set a conservative search_path that includes pg_catalog and public only
    -- (do NOT add other schemas here unless you've moved extensions and tested staging)
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = %L',
        r.schema, r.name, r.args, 'pg_catalog, public'
      );
      RAISE NOTICE 'Set search_path for function %.% (%).', r.schema, r.name, r.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to set search_path for function %.% (%): %', r.schema, r.name, r.args, SQLERRM;
    END;
  END LOOP;
END$$;

COMMIT;

-- Validation queries (run after this script to confirm):
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'embedding_backfill_jobs';
-- SELECT pol.policyname, pol.polcmd FROM pg_policies pol WHERE pol.tablename = 'embedding_backfill_jobs';
-- SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
-- FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
--   'increment_tenant_usage', 'match_embeddings_by_tenant', 'match_embeddings_by_tenant_768',
--   'update_updated_at_column', 'update_session_activity', 'cleanup_expired_admin_tokens',
--   'check_tenant_quota', 'set_tenant_context', 'cleanup_expired_sessions'
-- ]);

-- NOTE: The linter also warned about extensions (vector, pg_trgm) installed in `public`.
-- Moving extensions is higher risk and should be done in a separate migration after testing.
-- Suggested separate steps (manual validation in staging first):
--   1) Create a dedicated schema for extensions: CREATE SCHEMA IF NOT EXISTS _extensions;
--   2) Test ALTER EXTENSION <name> SET SCHEMA _extensions for each extension in staging.
--   3) Update any function search_path to include _extensions if you move them.

-- Migration: ensure `embedding_backfill_jobs` has at least one RLS policy
-- Run on STAGING first and verify. This script is idempotent.

-- Behavior:
-- * If `public.embedding_backfill_jobs` exists and already has policies, do nothing.
-- * If the table has a `tenant_id` column and no policies exist, create a tenant-scoped policy
--   that uses `current_setting('app.current_tenant', true)` to scope access.
-- * If the table has no `tenant_id` column and no policies exist, create a deny-all policy
--   (safe default) to prevent public access until a tailored policy is applied.

BEGIN;

DO $$
BEGIN
  -- Only act when the table exists in public
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'embedding_backfill_jobs' AND c.relnamespace = 'public'::regnamespace) THEN
    -- If the table already has ANY policy, leave it alone
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'embedding_backfill_jobs') THEN
      -- If tenant_id column exists, add tenant isolation policy
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'embedding_backfill_jobs' AND column_name = 'tenant_id'
      ) THEN
        EXECUTE 'CREATE POLICY embedding_backfill_jobs_tenant_isolation ON public.embedding_backfill_jobs USING (tenant_id = current_setting(''app.current_tenant'', true)::text) WITH CHECK (tenant_id = current_setting(''app.current_tenant'', true)::text)';
      ELSE
        -- No tenant column: create a conservative deny-all policy to secure the table
        EXECUTE 'CREATE POLICY embedding_backfill_jobs_deny_public ON public.embedding_backfill_jobs FOR ALL USING (false)';
      END IF;
    END IF;
  END IF;
END$$;

COMMIT;

-- Validation queries (run after this migration):
-- SELECT * FROM pg_policies WHERE tablename = 'embedding_backfill_jobs';
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'embedding_backfill_jobs';

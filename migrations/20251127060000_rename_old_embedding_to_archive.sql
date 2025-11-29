-- Migration: 20251127060000_rename_old_embedding_to_archive.sql
-- Purpose: Rename legacy `embedding` column to `embedding_1536_archive` for archival.
-- IMPORTANT: This migration changes column names. Update application code and DB functions (RPCs) accordingly.
-- Recommended: Run during a maintenance window. Ensure backups exist before running.

-- This migration is conservative: it only renames columns if they exist, and
-- attempts to rename indexes that reference the old column name.

BEGIN;

-- Rename legacy column in `embeddings` if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'embeddings' AND column_name = 'embedding'
  ) THEN
    EXECUTE 'ALTER TABLE public.embeddings RENAME COLUMN embedding TO embedding_1536_archive';
  END IF;
END$$;

-- Rename legacy column in `document_chunks` if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'document_chunks' AND column_name = 'embedding'
  ) THEN
    EXECUTE 'ALTER TABLE public.document_chunks RENAME COLUMN embedding TO embedding_1536_archive';
  END IF;
END$$;

-- Attempt to rename any index definitions that reference the old column name 'embedding'.
-- This loop will log a NOTICE if an index cannot be renamed.
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT schemaname, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexdef ILIKE '%embedding%'
  LOOP
    BEGIN
      -- rename index to append _1536_archive
      EXECUTE format('ALTER INDEX %I.%I RENAME TO %I', idx.schemaname, idx.indexname, idx.indexname || '_1536_archive');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not rename index % : %', idx.indexname, SQLERRM;
    END;
  END LOOP;
END$$;

COMMIT;

-- NOTES:
--  - After running this migration, update any database functions (RPCs) or
--    application queries that refer to the `embedding` column to use the new
--    name `embedding_1536_archive` or prefer `embedding_384`.
--  - Dropping archived data or removing the `_1536_archive` column should only
--    be done after a monitoring/retention window and with backups available.

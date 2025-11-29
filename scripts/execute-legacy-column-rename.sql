-- STEP 1: Check current state before migration
-- ============================================

-- Check columns exist
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'embeddings' OR table_name = 'document_chunks')
  AND column_name IN ('embedding', 'embedding_384', 'embedding_1536_archive')
ORDER BY table_name, column_name;

-- Check indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('embeddings', 'document_chunks')
  AND indexdef ILIKE '%embedding%'
ORDER BY tablename, indexname;

-- Check RPCs
SELECT 
  proname AS function_name,
  prosrc AS source_code
FROM pg_proc
WHERE proname ILIKE '%match_embedding%'
ORDER BY proname;


-- STEP 2: Update legacy RPC to use embedding_1536_archive (BEFORE renaming)
-- ==========================================================================
-- This ensures the RPC will work after column rename

CREATE OR REPLACE FUNCTION match_embeddings_by_tenant(
  query_embedding vector(1536),
  match_count int,
  match_tenant_id text,
  match_threshold float DEFAULT 0.0
)
RETURNS TABLE (
  id uuid,
  tenant_id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.tenant_id,
    e.content,
    e.metadata,
    1 - (e.embedding_1536_archive <=> query_embedding) AS similarity
  FROM embeddings e
  WHERE e.tenant_id = match_tenant_id
    AND e.embedding_1536_archive IS NOT NULL
    AND (1 - (e.embedding_1536_archive <=> query_embedding)) >= match_threshold
  ORDER BY e.embedding_1536_archive <=> query_embedding
  LIMIT match_count;
END;
$$;

-- IMPORTANT NOTE: The above RPC update will FAIL if 'embedding_1536_archive' doesn't exist yet.
-- This is expected - we need to run the rename first, then update the RPC.
-- So the correct order is:
--   1. Run STEP 3 (rename migration)
--   2. Then run STEP 2 (update RPC)


-- STEP 3: Execute rename migration
-- =================================
-- Run this AFTER confirming step 1 shows 'embedding' exists and 'embedding_1536_archive' does NOT exist

BEGIN;

-- Rename legacy column in `embeddings` if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'embeddings' AND column_name = 'embedding'
  ) THEN
    EXECUTE 'ALTER TABLE public.embeddings RENAME COLUMN embedding TO embedding_1536_archive';
    RAISE NOTICE 'Renamed embeddings.embedding → embedding_1536_archive';
  ELSE
    RAISE NOTICE 'Column embeddings.embedding does not exist - already renamed?';
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
    RAISE NOTICE 'Renamed document_chunks.embedding → embedding_1536_archive';
  ELSE
    RAISE NOTICE 'Column document_chunks.embedding does not exist - already renamed?';
  END IF;
END$$;

-- Attempt to rename indexes (HNSW index on legacy embedding column)
-- Note: This will fail gracefully if index doesn't exist
DO $$
DECLARE
  idx RECORD;
  new_name text;
BEGIN
  FOR idx IN
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' 
      AND (tablename = 'embeddings' OR tablename = 'document_chunks')
      AND indexdef ILIKE '%embedding%'
      AND indexname NOT ILIKE '%384%'  -- Don't rename our new 384 indexes
      AND indexname NOT ILIKE '%archive%' -- Skip already renamed
  LOOP
    BEGIN
      -- Build new name: append _1536_archive before any trailing suffix
      new_name := regexp_replace(idx.indexname, '_hnsw$', '_1536_archive_hnsw');
      IF new_name = idx.indexname THEN
        new_name := idx.indexname || '_1536_archive';
      END IF;
      
      EXECUTE format('ALTER INDEX %I RENAME TO %I', idx.indexname, new_name);
      RAISE NOTICE 'Renamed index % → %', idx.indexname, new_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not rename index %: %', idx.indexname, SQLERRM;
    END;
  END LOOP;
END$$;

COMMIT;


-- STEP 4: Verify rename was successful
-- =====================================
-- Run this AFTER step 3 to confirm changes

SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'embeddings' OR table_name = 'document_chunks')
  AND column_name IN ('embedding', 'embedding_384', 'embedding_1536_archive')
ORDER BY table_name, column_name;

-- Should now show:
--   embeddings     | embedding_1536_archive | USER-DEFINED
--   embeddings     | embedding_384          | USER-DEFINED
--   document_chunks| embedding_1536_archive | USER-DEFINED (if existed)
--   document_chunks| embedding_384          | USER-DEFINED

-- Check indexes were renamed
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('embeddings', 'document_chunks')
  AND (indexdef ILIKE '%embedding_1536_archive%' OR indexdef ILIKE '%embedding_384%')
ORDER BY tablename, indexname;

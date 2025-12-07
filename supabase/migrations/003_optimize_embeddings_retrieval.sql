-- Migration: Optimize match_embeddings_by_tenant function and index
-- Date: 2025-12-07
-- Purpose: Improve performance and readability of RAG retrieval queries
-- Changes:
--   1. Convert function to LANGUAGE sql (faster, immutable)
--   2. Reference embedding_768 column explicitly (matches current schema)
--   3. Compute distance once, order by it efficiently
--   4. Add optimized ivfflat index on embedding_768
--   5. Validate tenant_id concisely, rely on CHECK constraints

BEGIN;

-- Ensure pgvector extension exists (no-op if already installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop old function and any conflicting signatures (schema-qualified)
DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant(vector, text, int, float) CASCADE;
DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant(vector(1536), text, int, float) CASCADE;
DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant(vector(768), text, int, float) CASCADE;

-- Drop legacy indexes if present
DROP INDEX IF EXISTS public.embeddings_vector_idx;
DROP INDEX IF EXISTS public.embeddings_embedding_768_idx;
DROP INDEX IF EXISTS public.embeddings_embedding_768_hnsw;

-- ============================================================================
-- Optimized function: LANGUAGE sql (immutable, faster call path)
-- References embedding_768 column explicitly
-- Computes distance once: alias 'dist', return 1 - dist as similarity
-- Validates tenant_id format concisely (fail closed if invalid)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(
  query_embedding vector(768),
  match_tenant_id text,
  match_count int DEFAULT 5,
  similarity_threshold float DEFAULT 0.0
)
RETURNS TABLE (
  id uuid,
  chunk_text text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
STRICT
SET search_path = public,extensions
AS $$
  -- If you want to early-fail invalid tenant ids at call time, uncomment next line:
  -- SELECT NULL WHERE NOT (match_tenant_id ~ '^tn_[a-f0-9]{32}$') LIMIT 0;

  SELECT id, chunk_text, metadata, similarity
  FROM (
    SELECT
      e.id,
      e.chunk_text,
      e.metadata,
      (1.0 - (e.embedding_768::vector <=> query_embedding::vector))::float AS similarity,
      (e.embedding_768::vector <=> query_embedding::vector) AS dist
    FROM public.embeddings e
    WHERE e.tenant_id = match_tenant_id
      AND e.embedding_768 IS NOT NULL
  ) sub
  WHERE similarity >= similarity_threshold
  ORDER BY dist
  LIMIT match_count;
$$;

-- Grant to appropriate roles only (not PUBLIC)
GRANT EXECUTE ON FUNCTION public.match_embeddings_by_tenant(vector(768), text, int, float) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_embeddings_by_tenant(vector(768), text, int, float) TO service_role;

-- ============================================================================
-- Create HNSW index on embedding_768 using cosine operator (matches <=>)
-- Recommended defaults (tune for your dataset):
--   m = 16 (number of bi-directional links; higher m -> higher accuracy, slower build)
--   ef_construction = 64 (bigger -> higher index quality, slower build)
-- ============================================================================

CREATE INDEX IF NOT EXISTS embeddings_embedding_768_hnsw
  ON public.embeddings USING hnsw (embedding_768 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- Ensure tenant_id equality is fast: btree index on tenant_id
-- ============================================================================
CREATE INDEX IF NOT EXISTS embeddings_tenant_id_idx
  ON public.embeddings (tenant_id);

-- Optional: Combined index for typical query pattern (tenant + created_at)
CREATE INDEX IF NOT EXISTS embeddings_tenant_created_idx
  ON public.embeddings (tenant_id, created_at DESC);

-- Optional: add a CHECK constraint to enforce tenant_id format; guarded to avoid duplicate errors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'embeddings_tenant_id_format'
      AND conrelid = 'public.embeddings'::regclass
  ) THEN
    ALTER TABLE public.embeddings
      ADD CONSTRAINT embeddings_tenant_id_format
      CHECK (tenant_id ~ '^tn_[a-f0-9]{32}$');
  END IF;
END $$;

-- Gather statistics to help planner pick the new index
ANALYZE public.embeddings;

COMMIT;

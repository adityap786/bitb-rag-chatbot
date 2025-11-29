-- Migration: Remove legacy embedding columns (1536, 384) from embeddings table
-- Date: 2025-11-28

ALTER TABLE IF EXISTS public.embeddings
  DROP COLUMN IF EXISTS embedding,
  DROP COLUMN IF EXISTS embedding_384,
  DROP COLUMN IF EXISTS embedding_1536,
  DROP COLUMN IF EXISTS embedding_1536_archive;

-- Remove legacy indexes if they exist
DROP INDEX IF EXISTS embeddings_vector_idx;
DROP INDEX IF EXISTS idx_embeddings_vector;

-- (Optional) Update or drop any functions referencing old columns
-- Example:
-- DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant;
-- (Recreate with only embedding_768 if needed)

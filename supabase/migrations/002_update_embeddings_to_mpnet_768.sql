-- Migration: Resize embeddings to 768 dims for mpnet
-- Date: 2025-12-07
-- Note: This truncates existing embeddings because vector(1536) values cannot be down-converted to 768.
-- After applying, re-embed content with the mpnet model.

BEGIN;

-- Drop the existing IVFFlat index before altering the vector dimension
DROP INDEX IF EXISTS embeddings_vector_idx;

-- Clear existing embeddings to avoid dimension mismatch during type change
TRUNCATE TABLE embeddings;

-- Resize embedding column to mpnet dimensionality (768)
ALTER TABLE embeddings
  ALTER COLUMN embedding TYPE vector(768);

-- Recreate IVFFlat index for cosine similarity
CREATE INDEX IF NOT EXISTS embeddings_vector_idx
  ON embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Update search function signature to 768 dims
CREATE OR REPLACE FUNCTION match_embeddings_by_tenant(
  query_embedding VECTOR(768),
  match_tenant_id TEXT,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  chunk_text TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- CRITICAL SECURITY CHECK: Fail closed if tenant_id missing
  IF match_tenant_id IS NULL OR match_tenant_id = '' THEN
    RAISE EXCEPTION 'SECURITY: tenant_id is required and cannot be NULL';
  END IF;

  -- Validate tenant_id format
  IF match_tenant_id !~ '^tn_[a-f0-9]{32}$' THEN
    RAISE EXCEPTION 'SECURITY: Invalid tenant_id format';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.chunk_text,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM embeddings e
  WHERE e.tenant_id = match_tenant_id
    AND (1 - (e.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_embeddings_by_tenant TO authenticated;
GRANT EXECUTE ON FUNCTION match_embeddings_by_tenant TO service_role;

COMMIT;


-- Migration removed: All embeddings use 768-dim. No 384-dim migration needed.

-- Step 1: Drop existing indexes that depend on the vector column
DROP INDEX IF EXISTS document_chunks_embedding_idx;
DROP INDEX IF EXISTS idx_documents_embedding;

-- Step 2: Alter the embedding column to use 384 dimensions
-- Note: This requires the table to be empty or data to be re-embedded
ALTER TABLE document_chunks 
  ALTER COLUMN embedding TYPE vector(384);

-- Step 3: Update semantic_cache if it has query_embedding
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'semantic_cache' 
    AND column_name = 'query_embedding'
  ) THEN
    ALTER TABLE semantic_cache 
      ALTER COLUMN query_embedding TYPE vector(384);
  END IF;
END $$;

-- Step 4: Recreate the vector index with IVFFlat for 384 dimensions
-- IVFFlat is good for ~100k-1M vectors, fast and memory efficient
CREATE INDEX document_chunks_embedding_idx ON document_chunks 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Step 5: Update the similarity search function to use correct dimensions
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  p_tenant_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE 
    (p_tenant_id IS NULL OR dc.tenant_id = p_tenant_id)
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION match_documents IS 
  'Vector similarity search using 384-dim embeddings (all-MiniLM-L6-v2). 
   Returns documents sorted by cosine similarity.';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: Embedding dimensions changed to 384 for open-source models';
END $$;

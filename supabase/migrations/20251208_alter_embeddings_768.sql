-- Alter embeddings table to use 768 dimensions for MPNet
-- This assumes the table is empty or you are okay with truncating/converting.
-- Since this is a dev/trial environment, we will alter the column type.

-- First, drop the index that depends on the column
DROP INDEX IF EXISTS idx_embeddings_vector;

-- Alter the column type
ALTER TABLE embeddings 
ALTER COLUMN embedding TYPE vector(768);

-- Recreate the index with 768 dimensions
CREATE INDEX idx_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);

-- Also update vector_documents if it exists (from previous migrations)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vector_documents') THEN
    DROP INDEX IF EXISTS vector_documents_embedding_idx;
    ALTER TABLE vector_documents ALTER COLUMN embedding TYPE vector(768);
    CREATE INDEX vector_documents_embedding_idx ON vector_documents USING ivfflat (embedding) WITH (lists = 100);
  END IF;
END$$;

-- Update match_embeddings_by_tenant for 768-dim
CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(query_embedding vector(768), match_count int, p_tenant_id text)
RETURNS TABLE (id uuid, tenant_id text, content text, metadata jsonb, similarity double precision)
AS $$
  SELECT d.id, d.tenant_id, d.content, d.metadata,
    1.0 / (1 + (d.embedding <-> query_embedding)) AS similarity
  FROM public.vector_documents d
  WHERE d.tenant_id = p_tenant_id
  ORDER BY d.embedding <-> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

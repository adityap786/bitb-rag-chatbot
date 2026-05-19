-- Migration: embeddings table and match_embeddings function
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_chunk ON embeddings (tenant_id, chunk_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops);

-- Function for similarity search
CREATE OR REPLACE FUNCTION match_embeddings(
  tenant_id uuid,
  query_embedding vector,
  match_count int
)
RETURNS TABLE(id uuid, chunk_id uuid, score float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT id, chunk_id, 1 - (embedding <=> query_embedding) AS score
  FROM embeddings
  WHERE tenant_id = match_embeddings.tenant_id
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

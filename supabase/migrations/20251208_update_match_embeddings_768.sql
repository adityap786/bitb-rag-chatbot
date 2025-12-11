-- Update match_embeddings function to support 768-dimensional vectors (MPNet)
-- and ensure it works with the embeddings table

CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(768),
  match_tenant UUID,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  embedding_id UUID,
  kb_id UUID,
  chunk_text TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.embedding_id,
    e.kb_id,
    e.chunk_text,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM embeddings e
  WHERE e.tenant_id = match_tenant
  AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

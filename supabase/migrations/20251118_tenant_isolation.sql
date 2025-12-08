-- Enable Row-Level Security on embeddings table
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Tenant isolation on embeddings" ON embeddings;
DROP POLICY IF EXISTS "Service role bypass" ON embeddings;

-- Create strict tenant isolation policy
CREATE POLICY "Tenant isolation on embeddings"
ON embeddings
FOR ALL
USING (
  -- Only allow access if tenant_id matches
  tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'
  OR
  -- Service role can access all (for admin operations)
  auth.jwt()->>'role' = 'service_role'
);

-- Create function for vector search with explicit tenant filter
CREATE OR REPLACE FUNCTION match_embeddings_by_tenant(
  query_embedding vector(1536),
  match_tenant_id text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  tenant_id text,
  content text,
  embedding vector(1536),
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- CRITICAL: Explicit tenant filter in WHERE clause
  RETURN QUERY
  SELECT
    embeddings.id,
    embeddings.tenant_id,
    embeddings.content,
    embeddings.embedding,
    embeddings.metadata,
    1 - (embeddings.embedding <=> query_embedding) as similarity,
    embeddings.created_at
  FROM embeddings
  WHERE embeddings.tenant_id = match_tenant_id
    AND 1 - (embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for fast vector search per tenant
CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_vector
ON embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100)
WHERE tenant_id IS NOT NULL;

-- Create index for tenant filtering
CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_id
ON embeddings (tenant_id);

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_embeddings_by_tenant TO authenticated;
GRANT EXECUTE ON FUNCTION match_embeddings_by_tenant TO service_role;

-- Fix match_embeddings_by_tenant to handle vector operator schema issue
-- The vector type is in 'extensions' schema, need to set search_path correctly

-- Drop existing function
DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant(query_embedding vector, match_count integer, p_tenant_id text);

-- Create the corrected function with proper search_path
CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(
    query_embedding vector,
    match_count integer,
    p_tenant_id text
)
RETURNS TABLE (
    id uuid,
    tenant_id text,
    content text,
    chunk_text text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    -- Validate tenant_id is not NULL for security
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id cannot be NULL';
    END IF;
    
    RETURN QUERY
    SELECT
        e.id,
        e.tenant_id,
        e.content,
        e.chunk_text,
        e.metadata,
        (1 - (e.embedding_768 <=> query_embedding))::float AS similarity
    FROM embeddings e
    WHERE e.tenant_id = p_tenant_id
    AND e.embedding_768 IS NOT NULL
    ORDER BY e.embedding_768 <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.match_embeddings_by_tenant(vector, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_embeddings_by_tenant(vector, integer, text) TO service_role;

COMMENT ON FUNCTION public.match_embeddings_by_tenant(vector, integer, text) IS 'Semantic search using 768-dim embeddings with mandatory tenant isolation. Fixed search_path for vector operators.';

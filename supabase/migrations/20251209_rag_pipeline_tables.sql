-- Migration: Add RAG Pipeline Tables and Functions
-- Description: Adds ingestion_job_steps table and match_embeddings function required for the RAG pipeline.

-- 1. Create ingestion_job_steps table
CREATE TABLE IF NOT EXISTS public.ingestion_job_steps (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.ingestion_jobs(job_id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  eta_ms INT,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(job_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_ingestion_job_steps_job_id ON public.ingestion_job_steps(job_id);

-- 2. Create match_embeddings function (Hybrid Search)
-- Note: This assumes the 'vector' extension is already enabled and 'embeddings' table exists.
CREATE OR REPLACE FUNCTION public.match_embeddings(
  query_embedding vector(768),
  match_tenant TEXT,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  embedding_id UUID,
  kb_id UUID,
  chunk_text TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id as embedding_id,
    e.kb_id,
    e.chunk_text,
    1 - (e.embedding_768 <=> query_embedding) AS similarity,
    e.metadata
  FROM public.embeddings e
  WHERE e.tenant_id = match_tenant
  AND 1 - (e.embedding_768 <=> query_embedding) > similarity_threshold
  ORDER BY e.embedding_768 <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 3. Grant permissions (adjust based on your RLS setup)
GRANT ALL ON public.ingestion_job_steps TO authenticated;
GRANT ALL ON public.ingestion_job_steps TO service_role;
GRANT EXECUTE ON FUNCTION public.match_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_embeddings TO service_role;

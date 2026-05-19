-- Add Full Text Search support to embeddings table for Hybrid Search

-- 1. Add fts column to embeddings, automatically generated from content
ALTER TABLE public.embeddings 
ADD COLUMN IF NOT EXISTS fts tsvector 
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- 2. Create GIN index for fast search
CREATE INDEX IF NOT EXISTS idx_embeddings_fts ON public.embeddings USING GIN (fts);

-- 3. Create/Update Hybrid Search RPC (optional, but good for atomic operations)
-- This function matches the signature expected by rag-pipeline.ts (but logic might have been different)
-- We'll rely on the client-side merge for now as per existing TS code, 
-- implies we just need the column for the text search part.

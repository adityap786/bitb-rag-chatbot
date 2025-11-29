-- Migration: create vector_documents table and tenant-aware RPCs
-- Date: 2025-11-22
-- Notes: This migration creates a vector table for RAG storage and helper
-- functions used by the ingestion/retrieval pipeline. All embeddings use vector(768) for mpnet/nomic models.

BEGIN;

-- Ensure pgcrypto (for gen_random_uuid) and pgvector are available
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the vector_documents table used by the ingestion pipeline
CREATE TABLE IF NOT EXISTS public.vector_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  content text,
  metadata jsonb,
  embedding_768 vector(768),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create a vector index (ivfflat) for faster ANN queries. Tune `lists` for your dataset.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vector_documents_embedding_idx') THEN
    EXECUTE 'CREATE INDEX vector_documents_embedding_idx ON public.vector_documents USING ivfflat (embedding) WITH (lists = 100)';
  END IF;
END$do$;

-- Helper: set tenant context using a GUC so RLS policies can depend on it
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.current_tenant', p_tenant_id, true);
$$;

-- ANN matching function that returns id, tenant_id, content, metadata, and a similarity score
-- Uses L2 distance (`<->`) from pgvector and converts distance into a similarity score (1 / (1 + distance)).
CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(query_embedding vector, match_count int, p_tenant_id text)
RETURNS TABLE (id uuid, tenant_id text, content text, metadata jsonb, similarity double precision)
AS $$
  SELECT d.id, d.tenant_id, d.content, d.metadata,
    1.0 / (1 + (d.embedding_768 <-> query_embedding)) AS similarity
  FROM public.vector_documents d
  WHERE d.tenant_id = p_tenant_id
    AND d.embedding_768 IS NOT NULL
  ORDER BY d.embedding_768 <-> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

-- Enable RLS and create a simple tenant-isolation policy
ALTER TABLE public.vector_documents ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'vector_documents_tenant_isolation'
  ) THEN
    EXECUTE 'CREATE POLICY vector_documents_tenant_isolation ON public.vector_documents USING (tenant_id = current_setting(''app.current_tenant'')::text)';
  END IF;
END$do$;

COMMIT;

-- NOTE:
-- - Adjust `vector(1536)` to match your embedding dimension.
-- - If you prefer to store embeddings as `double precision[]` instead of `vector`, update the functions accordingly.
-- - Run this migration via the Supabase SQL editor or via psql using your project's DB connection string.

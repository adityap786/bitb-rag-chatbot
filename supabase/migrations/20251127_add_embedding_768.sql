-- Migration: add 768-dim embedding columns and RPCs for mpnet (all-mpnet-base-v2)
-- Schema-only migration (index creation moved to a separate script)
-- Run this file inside a transaction (e.g. in Supabase SQL editor or psql)

BEGIN;

-- Ensure vector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Add 768-dim embedding column to existing embeddings table
ALTER TABLE public.embeddings
  ADD COLUMN IF NOT EXISTS embedding_768 vector(768);

-- Add embedding_768 to vector_documents table (if present)
ALTER TABLE IF EXISTS public.vector_documents
  ADD COLUMN IF NOT EXISTS embedding_768 vector(768);

-- Create RPC to set tenant context if absent
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.current_tenant', p_tenant_id, true);
$$;

-- Create a 768-dim ANN matching RPC that looks only at embedding_768
CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant_768(query_embedding vector, match_count int, p_tenant_id text)
RETURNS TABLE (id uuid, tenant_id text, content text, metadata jsonb, similarity double precision)
AS $fn$
  SELECT d.id, d.tenant_id, d.content, d.metadata,
    1.0 / (1 + (d.embedding_768 <-> query_embedding)) AS similarity
  FROM public.vector_documents d
  WHERE d.tenant_id = p_tenant_id
    AND d.embedding_768 IS NOT NULL
  ORDER BY d.embedding_768 <-> query_embedding
  LIMIT match_count;
$fn$ LANGUAGE sql STABLE;

-- Optionally update the generic RPC name to point to 768-dim behavior if desired
-- (This will replace any existing 'match_embeddings_by_tenant' implementation.)
CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(query_embedding vector, match_count int, p_tenant_id text)
RETURNS TABLE (id uuid, tenant_id text, content text, metadata jsonb, similarity double precision)
AS $fn$
  -- Prefer 768-dim matching when available
  SELECT d.id, d.tenant_id, d.content, d.metadata,
    1.0 / (1 + (d.embedding_768 <-> query_embedding)) AS similarity
  FROM public.vector_documents d
  WHERE d.tenant_id = p_tenant_id
    AND d.embedding_768 IS NOT NULL
  ORDER BY d.embedding_768 <-> query_embedding
  LIMIT match_count;
$fn$ LANGUAGE sql STABLE;

-- Enable RLS on relevant tables (idempotent)
ALTER TABLE IF EXISTS public.trial_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vector_documents ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies (safe to re-run)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'trial_tenants') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trial_tenants' AND policyname='tenant_isolation_trial') THEN
      EXECUTE 'CREATE POLICY tenant_isolation_trial ON public.trial_tenants FOR ALL USING (tenant_id = current_setting(''app.current_tenant_id'', true)::UUID)';
    END IF;
  END IF;
END$do$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vector_documents') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vector_documents' AND policyname='vector_documents_tenant_isolation') THEN
      EXECUTE 'CREATE POLICY vector_documents_tenant_isolation ON public.vector_documents USING (tenant_id = current_setting(''app.current_tenant'')::text)';
    END IF;
  END IF;
END$do$;

COMMIT;

-- NOTE: Index creation has been moved to a separate script: `20251127_add_embedding_768_indexes.sql`.
-- Run that file outside of a transaction (psql or the Supabase SQL editor) because it uses
-- `CREATE INDEX CONCURRENTLY` for low-lock index builds. See the companion indexes script.

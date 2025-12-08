-- Migration: Create trial_tenants schema and update for 1024-dim embeddings (bge-base-en-v1.5)
-- Run this in the Supabase SQL editor or via psql

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- trial_tenants table
CREATE TABLE IF NOT EXISTS trial_tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  business_name VARCHAR(255),
  business_type VARCHAR(50) CHECK (business_type IN ('service', 'ecommerce', 'saas', 'other')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  trial_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '3 days',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'upgraded', 'cancelled')),
  plan_upgraded_to VARCHAR(20),
  setup_token TEXT,
  rag_status VARCHAR(20) DEFAULT 'pending' CHECK (rag_status IN ('pending', 'processing', 'ready', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_trial_tenants_email ON trial_tenants(email);
CREATE INDEX IF NOT EXISTS idx_trial_tenants_status ON trial_tenants(status);
CREATE INDEX IF NOT EXISTS idx_trial_tenants_expires ON trial_tenants(trial_expires_at);

-- knowledge_base table
CREATE TABLE IF NOT EXISTS knowledge_base (
  kb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  source_type VARCHAR(20) CHECK (source_type IN ('upload', 'crawl', 'manual')),
  content_hash VARCHAR(64) UNIQUE,
  raw_text TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_tenant ON knowledge_base(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kb_hash ON knowledge_base(content_hash);
CREATE INDEX IF NOT EXISTS idx_kb_source ON knowledge_base(tenant_id, source_type);

-- embeddings table (1024-dim for bge-base-en-v1.5)
CREATE TABLE IF NOT EXISTS embeddings (
  embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES knowledge_base(kb_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(1024),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_embeddings_tenant ON embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_kb ON embeddings(kb_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);

-- widget_configs table
CREATE TABLE IF NOT EXISTS widget_configs (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  primary_color VARCHAR(7) DEFAULT '#6366f1',
  secondary_color VARCHAR(7) DEFAULT '#8b5cf6',
  chat_tone VARCHAR(20) DEFAULT 'professional' CHECK (chat_tone IN ('professional', 'friendly', 'casual')),
  welcome_message TEXT DEFAULT 'Hello! How can I help you today?',
  placeholder_text VARCHAR(255) DEFAULT 'Type your message...',
  assigned_tools JSONB DEFAULT '[]'::jsonb,
  prompt_template TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_widget_tenant ON widget_configs(tenant_id);

-- chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  visitor_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes',
  messages JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON chat_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON chat_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON chat_sessions(tenant_id, visitor_id);

-- crawl_jobs table
CREATE TABLE IF NOT EXISTS crawl_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  start_url TEXT NOT NULL,
  max_pages INT DEFAULT 20,
  max_depth INT DEFAULT 2,
  status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  pages_crawled INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crawl_tenant ON crawl_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crawl_status ON crawl_jobs(status);

-- vector_documents table (1024-dim for bge-base-en-v1.5)
CREATE TABLE IF NOT EXISTS public.vector_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  content text,
  metadata jsonb,
  embedding vector(1024),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vector_documents_embedding_idx') THEN
    EXECUTE 'CREATE INDEX vector_documents_embedding_idx ON public.vector_documents USING ivfflat (embedding) WITH (lists = 100)';
  END IF;
END$$;

-- set_tenant_context helper
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.current_tenant', p_tenant_id, true);
$$;

-- match_embeddings_by_tenant for 1024-dim
CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(query_embedding vector, match_count int, p_tenant_id text)
RETURNS TABLE (id uuid, tenant_id text, content text, metadata jsonb, similarity double precision)
AS $$
  SELECT d.id, d.tenant_id, d.content, d.metadata,
    1.0 / (1 + (d.embedding <-> query_embedding)) AS similarity
  FROM public.vector_documents d
  WHERE d.tenant_id = p_tenant_id
  ORDER BY d.embedding <-> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

-- Enable RLS and tenant isolation policies
ALTER TABLE trial_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vector_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS tenant_isolation_trial ON trial_tenants
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY IF NOT EXISTS tenant_isolation_kb ON knowledge_base
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY IF NOT EXISTS tenant_isolation_embeddings ON embeddings
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY IF NOT EXISTS tenant_isolation_widget ON widget_configs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY IF NOT EXISTS tenant_isolation_sessions ON chat_sessions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY IF NOT EXISTS tenant_isolation_crawl ON crawl_jobs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY IF NOT EXISTS vector_documents_tenant_isolation ON public.vector_documents
  USING (tenant_id = current_setting('app.current_tenant')::text);

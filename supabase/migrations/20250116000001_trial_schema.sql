-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Trial Tenants Table
CREATE TABLE IF NOT EXISTS trial_tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  business_name VARCHAR(255),
  business_type VARCHAR(50) CHECK (business_type IN ('service', 'ecommerce', 'saas', 'other')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  trial_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '3 days',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'upgraded', 'cancelled')),
  plan_upgraded_to VARCHAR(20),
  setup_token TEXT, -- JWT for onboarding steps
  rag_status VARCHAR(20) DEFAULT 'pending' CHECK (rag_status IN ('pending', 'processing', 'ready', 'failed'))
);

CREATE INDEX idx_trial_tenants_email ON trial_tenants(email);
CREATE INDEX idx_trial_tenants_status ON trial_tenants(status);
CREATE INDEX idx_trial_tenants_expires ON trial_tenants(trial_expires_at);

-- Knowledge Base Table
CREATE TABLE IF NOT EXISTS knowledge_base (
  kb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  source_type VARCHAR(20) CHECK (source_type IN ('upload', 'crawl', 'manual')),
  content_hash VARCHAR(64) UNIQUE, -- SHA256 for deduplication
  raw_text TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_tenant ON knowledge_base(tenant_id);
CREATE INDEX idx_kb_hash ON knowledge_base(content_hash);
CREATE INDEX idx_kb_source ON knowledge_base(tenant_id, source_type);

-- Vector Embeddings Table
CREATE TABLE IF NOT EXISTS embeddings (
  embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES knowledge_base(kb_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 dimension
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_tenant ON embeddings(tenant_id);
CREATE INDEX idx_embeddings_kb ON embeddings(kb_id);
-- Vector similarity search index (HNSW for fast approximate nearest neighbor)
CREATE INDEX idx_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);

-- Widget Configuration Table
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

CREATE INDEX idx_widget_tenant ON widget_configs(tenant_id);

-- Chat Sessions Table (Ephemeral)
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  visitor_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes',
  messages JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb -- referrer, user_agent, etc.
);

CREATE INDEX idx_sessions_tenant ON chat_sessions(tenant_id);
CREATE INDEX idx_sessions_expiry ON chat_sessions(expires_at);
CREATE INDEX idx_sessions_visitor ON chat_sessions(tenant_id, visitor_id);

-- Crawl Jobs Table (for async website crawling)
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

CREATE INDEX idx_crawl_tenant ON crawl_jobs(tenant_id);
CREATE INDEX idx_crawl_status ON crawl_jobs(status);

-- Cosine similarity search function
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1536),
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

-- Cleanup expired sessions function
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM chat_sessions
  WHERE expires_at < NOW();
END;
$$;

-- Auto-update last_activity trigger
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_activity = NOW();
  NEW.expires_at = NOW() + INTERVAL '30 minutes';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_session_activity
BEFORE UPDATE ON chat_sessions
FOR EACH ROW
EXECUTE FUNCTION update_session_activity();

-- Auto-update widget_configs updated_at trigger
CREATE OR REPLACE FUNCTION update_widget_config_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_widget_config_timestamp
BEFORE UPDATE ON widget_configs
FOR EACH ROW
EXECUTE FUNCTION update_widget_config_timestamp();

-- Row Level Security (RLS) policies
ALTER TABLE trial_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Tenants can only access their own data
CREATE POLICY tenant_isolation_trial ON trial_tenants
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_kb ON knowledge_base
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_embeddings ON embeddings
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_widget ON widget_configs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_sessions ON chat_sessions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_crawl ON crawl_jobs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

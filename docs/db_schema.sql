-- Supabase/pgvector Best Practices: Multi-Tenant SaaS Chatbot Platform
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- trial_tenants
CREATE TABLE IF NOT EXISTS trial_tenants (
  tenant_id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  trial_expires_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL,
  plan_upgraded_to TEXT
);
CREATE INDEX IF NOT EXISTS idx_trial_tenants_status ON trial_tenants(status);

-- knowledge_base
CREATE TABLE IF NOT EXISTS knowledge_base (
  kb_id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  metadata JSONB,
  processed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_kb_tenant_id ON knowledge_base(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kb_content_hash ON knowledge_base(content_hash);

-- embeddings
CREATE TABLE IF NOT EXISTS embeddings (
  embedding_id UUID PRIMARY KEY,
  kb_id UUID REFERENCES knowledge_base(kb_id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding_768 vector(768) NOT NULL,
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_id ON embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_embedding ON embeddings USING ivfflat (embedding vector_cosine_ops);

-- widget_configs
CREATE TABLE IF NOT EXISTS widget_configs (
  config_id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  primary_color TEXT,
  secondary_color TEXT,
  chat_tone TEXT,
  welcome_message TEXT,
  placeholder_text TEXT,
  assigned_tools JSONB,
  prompt_template TEXT
);
CREATE INDEX IF NOT EXISTS idx_widget_configs_tenant_id ON widget_configs(tenant_id);

-- chat_sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  visitor_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP,
  expires_at TIMESTAMP,
  messages JSONB
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant_id ON chat_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_expires_at ON chat_sessions(expires_at);

-- rag_audit_log
CREATE TABLE IF NOT EXISTS rag_audit_log (
  audit_id UUID PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  tenant_id_hash TEXT NOT NULL,
  session_id_hash TEXT,
  query_text_hash TEXT,
  retriever_id TEXT,
  chunks_returned INT,
  chunk_ids TEXT[],
  average_similarity FLOAT,
  pii_redacted BOOLEAN,
  anomaly_detected BOOLEAN,
  latency_ms INT
);
CREATE INDEX IF NOT EXISTS idx_rag_audit_log_tenant_id_hash ON rag_audit_log(tenant_id_hash);
CREATE INDEX IF NOT EXISTS idx_rag_audit_log_timestamp ON rag_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_rag_audit_log_anomaly ON rag_audit_log(anomaly_detected);

-- mcp_tool_audit
CREATE TABLE IF NOT EXISTS mcp_tool_audit (
  tool_id UUID PRIMARY KEY,
  tool_name TEXT NOT NULL,
  tenant_id UUID REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  parameters JSONB,
  success BOOLEAN,
  error_message TEXT,
  execution_time INT
);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_audit_tenant_id ON mcp_tool_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_audit_success ON mcp_tool_audit(success);

-- Row-Level Security (RLS) for tenant isolation
ALTER TABLE trial_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_audit ENABLE ROW LEVEL SECURITY;

-- Example RLS policy for tenant isolation
CREATE POLICY tenant_isolation ON knowledge_base
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Automated backup schedule and connection pooling are configured in Supabase dashboard.
-- Query performance monitoring is enabled via Supabase/pg_stat_statements.

-- ingestion_jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  data_source TEXT NOT NULL,
  progress INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant_id ON ingestion_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);

-- ingestion_job_steps
CREATE TABLE IF NOT EXISTS ingestion_job_steps (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES ingestion_jobs(job_id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  eta_ms INT,
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(job_id, step_key)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_job_steps_job_id ON ingestion_job_steps(job_id);


-- Add columns to ingestion_jobs
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS pages_processed INT DEFAULT 0;
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS chunks_created INT DEFAULT 0;
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS embeddings_count INT DEFAULT 0;
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS error_details JSONB;

-- match_embeddings function
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(768),
  match_tenant UUID,
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
AS \$\$
BEGIN
  RETURN QUERY
  SELECT
    e.embedding_id,
    e.kb_id,
    e.chunk_text,
    1 - (e.embedding_768 <=> query_embedding) AS similarity,
    e.metadata
  FROM embeddings e
  WHERE e.tenant_id = match_tenant
  AND 1 - (e.embedding_768 <=> query_embedding) > similarity_threshold
  ORDER BY e.embedding_768 <=> query_embedding
  LIMIT match_count;
END;
\$\$;


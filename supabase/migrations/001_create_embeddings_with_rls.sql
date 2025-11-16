-- BiTB Multi-Tenant RAG Security Migration
-- Date: 2025-11-10
-- Purpose: Create embeddings and trials tables with Row-Level Security (RLS)
-- Security: MANDATORY tenant_id filtering on all queries

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Table: embeddings
-- Purpose: Store tenant-isolated vector embeddings for RAG
-- Security: RLS enforces WHERE tenant_id = current_setting('app.current_tenant_id')
-- ============================================================================

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding VECTOR(1536), -- OpenAI text-embedding-ada-002 dimensionality
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS embeddings_tenant_id_idx ON embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS embeddings_created_at_idx ON embeddings(created_at DESC);

-- Vector similarity index (IVFFlat for fast approximate nearest neighbor search)
-- Note: Build this AFTER inserting initial data for better clustering
CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Users can only read their tenant's embeddings
CREATE POLICY tenant_isolation_select ON embeddings
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Policy: INSERT - Users can only insert into their tenant
CREATE POLICY tenant_isolation_insert ON embeddings
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- Policy: UPDATE - Users can only update their tenant's embeddings
CREATE POLICY tenant_isolation_update ON embeddings
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- Policy: DELETE - Users can only delete their tenant's embeddings
CREATE POLICY tenant_isolation_delete ON embeddings
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ============================================================================
-- Table: trials
-- Purpose: Store trial tenant information and usage limits
-- Security: RLS enforces tenant isolation
-- ============================================================================

CREATE TABLE IF NOT EXISTS trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_token TEXT UNIQUE NOT NULL,
  tenant_id TEXT UNIQUE NOT NULL,
  site_origin TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  theme JSONB DEFAULT '{"theme": "auto", "brandColor": "#000000"}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'upgraded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  queries_used INT DEFAULT 0,
  queries_limit INT DEFAULT 100,
  CONSTRAINT trial_token_format CHECK (trial_token ~ '^tr_[a-f0-9]{32}$'),
  CONSTRAINT tenant_id_format CHECK (tenant_id ~ '^tn_[a-f0-9]{32}$')
);

-- Indexes for fast token lookups
CREATE INDEX IF NOT EXISTS trials_token_idx ON trials(trial_token);
CREATE INDEX IF NOT EXISTS trials_tenant_idx ON trials(tenant_id);
CREATE INDEX IF NOT EXISTS trials_status_idx ON trials(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS trials_expires_at_idx ON trials(expires_at) WHERE status = 'active';

-- RLS for trials
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Users can only see their trial
CREATE POLICY trial_isolation_select ON trials
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Policy: UPDATE - Users can only update their trial
CREATE POLICY trial_isolation_update ON trials
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- ============================================================================
-- Table: audit_logs
-- Purpose: Log every RAG query for security auditing
-- Security: Stores query_hash (SHA-256), never plaintext query
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  query_hash TEXT NOT NULL, -- SHA-256 of query (PII-safe)
  tool_used TEXT,
  confidence FLOAT,
  latency_ms INT,
  success BOOLEAN,
  error_message TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant-filtered log queries
CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp DESC);

-- RLS for audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: INSERT - Anyone can write logs (backend service role)
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (true); -- Backend inserts with service role key

-- Policy: SELECT - Users can only read their tenant's logs
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ============================================================================
-- Function: match_embeddings_by_tenant
-- Purpose: Semantic search with MANDATORY tenant filtering
-- Security: FAILS if tenant_id is NULL or empty
-- ============================================================================

CREATE OR REPLACE FUNCTION match_embeddings_by_tenant(
  query_embedding VECTOR(1536),
  match_tenant_id TEXT,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  chunk_text TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER -- Run with function owner's privileges
AS $$
BEGIN
  -- CRITICAL SECURITY CHECK: Fail closed if tenant_id missing
  IF match_tenant_id IS NULL OR match_tenant_id = '' THEN
    RAISE EXCEPTION 'SECURITY: tenant_id is required and cannot be NULL';
  END IF;

  -- Validate tenant_id format
  IF match_tenant_id !~ '^tn_[a-f0-9]{32}$' THEN
    RAISE EXCEPTION 'SECURITY: Invalid tenant_id format';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.chunk_text,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM embeddings e
  WHERE e.tenant_id = match_tenant_id -- MANDATORY FILTER
    AND (1 - (e.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION match_embeddings_by_tenant TO authenticated;
GRANT EXECUTE ON FUNCTION match_embeddings_by_tenant TO service_role;

-- ============================================================================
-- Function: set_tenant_context
-- Purpose: Helper to set RLS context for tenant isolation
-- ============================================================================

CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate tenant_id format
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^tn_[a-f0-9]{32}$' THEN
    RAISE EXCEPTION 'SECURITY: Invalid tenant_id format';
  END IF;

  -- Set RLS context
  PERFORM set_config('app.current_tenant_id', p_tenant_id, false);
END;
$$;

GRANT EXECUTE ON FUNCTION set_tenant_context TO authenticated;
GRANT EXECUTE ON FUNCTION set_tenant_context TO service_role;

-- ============================================================================
-- Function: cleanup_expired_trials
-- Purpose: Background job to purge embeddings for expired trials
-- Schedule: Run daily via pg_cron or external scheduler
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_trials()
RETURNS TABLE (
  tenant_id TEXT,
  embeddings_deleted INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_tenant RECORD;
  deleted_count INT;
BEGIN
  FOR expired_tenant IN 
    SELECT t.tenant_id 
    FROM trials t
    WHERE t.status = 'active' 
      AND t.expires_at < NOW()
  LOOP
    -- Delete embeddings for expired tenant
    DELETE FROM embeddings 
    WHERE embeddings.tenant_id = expired_tenant.tenant_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Mark trial as expired
    UPDATE trials 
    SET status = 'expired' 
    WHERE trials.tenant_id = expired_tenant.tenant_id;
    
    -- Return result
    tenant_id := expired_tenant.tenant_id;
    embeddings_deleted := deleted_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_expired_trials TO service_role;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE embeddings IS 'Tenant-isolated vector embeddings for RAG. All queries MUST filter by tenant_id.';
COMMENT ON TABLE trials IS 'Trial tenant metadata with usage limits and expiration.';
COMMENT ON TABLE audit_logs IS 'Security audit log for all RAG queries. Stores query hashes, not plaintext.';
COMMENT ON FUNCTION match_embeddings_by_tenant IS 'Semantic search with MANDATORY tenant filtering. Fails if tenant_id is NULL.';
COMMENT ON FUNCTION cleanup_expired_trials IS 'Background job to delete embeddings for expired trials.';

-- ============================================================================
-- End of migration
-- ============================================================================

-- Usage Monitoring and Audit Tables

-- Aggregated usage metrics (daily, hourly, monthly)
CREATE TABLE IF NOT EXISTS tenant_usage_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  
  -- Time period tracking
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type VARCHAR(20) CHECK (period_type IN ('hourly', 'daily', 'monthly')) DEFAULT 'daily',
  
  -- API usage metrics
  api_calls_total INT DEFAULT 0,
  api_calls_successful INT DEFAULT 0,
  api_calls_failed INT DEFAULT 0,
  api_calls_rate_limited INT DEFAULT 0,
  api_latency_avg_ms FLOAT DEFAULT 0,
  api_latency_p95_ms FLOAT DEFAULT 0,
  api_latency_p99_ms FLOAT DEFAULT 0,
  
  -- Chat-specific metrics
  chat_messages_sent INT DEFAULT 0,
  chat_messages_received INT DEFAULT 0,
  chat_sessions_created INT DEFAULT 0,
  chat_avg_response_time_ms FLOAT DEFAULT 0,
  
  -- Embeddings & RAG metrics
  embeddings_generated INT DEFAULT 0,
  embeddings_tokens_used INT DEFAULT 0,
  semantic_searches_performed INT DEFAULT 0,
  kb_documents_ingested INT DEFAULT 0,
  kb_documents_failed INT DEFAULT 0,
  
  -- Cost & quota tracking
  total_tokens_used INT DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 4) DEFAULT 0,
  quota_limit INT,
  quota_remaining INT,
  quota_exceeded_count INT DEFAULT 0,
  
  -- Performance indicators
  error_count INT DEFAULT 0,
  error_rate FLOAT DEFAULT 0,
  peak_qps FLOAT DEFAULT 0,
  
  -- Data quality
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, period_start, period_type)
);

CREATE INDEX idx_usage_tenant_period ON tenant_usage_metrics(tenant_id, period_start DESC);
CREATE INDEX idx_usage_period_type ON tenant_usage_metrics(tenant_id, period_type, period_start DESC);
CREATE INDEX idx_usage_quota_exceeded ON tenant_usage_metrics(tenant_id) WHERE quota_exceeded_count > 0;
CREATE INDEX idx_usage_high_latency ON tenant_usage_metrics(tenant_id) WHERE api_latency_p99_ms > 5000;

-- Real-time usage events (high-frequency)
CREATE TABLE IF NOT EXISTS tenant_usage_realtime (
  entry_id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Event-specific data
  api_method VARCHAR(10),
  api_endpoint VARCHAR(255),
  api_status_code INT,
  api_response_time_ms INT,
  
  chat_session_id UUID,
  embedding_tokens INT,
  search_query_tokens INT,
  search_result_count INT,
  
  -- Quota tracking
  tokens_consumed INT DEFAULT 0,
  cost_usd NUMERIC(10, 6),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_realtime_tenant_time ON tenant_usage_realtime(tenant_id, event_timestamp DESC);
CREATE INDEX idx_realtime_event_type ON tenant_usage_realtime(event_type, event_timestamp DESC);
CREATE INDEX idx_realtime_daily_cutoff ON tenant_usage_realtime(event_timestamp DESC)
  WHERE event_timestamp > NOW() - INTERVAL '30 days';

-- Audit event logging
CREATE TABLE IF NOT EXISTS audit_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  
  -- Action details
  action VARCHAR(50),
  actor_type VARCHAR(20),
  actor_id VARCHAR(255),
  
  -- Change tracking
  old_values JSONB,
  new_values JSONB,
  changes_summary TEXT,
  
  -- Status
  result VARCHAR(20),
  error_message TEXT,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(255),
  
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_time ON audit_events(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_event_type ON audit_events(event_type, timestamp DESC);
CREATE INDEX idx_audit_failures ON audit_events(timestamp DESC) WHERE result = 'failure';
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id, timestamp DESC);

-- Function to aggregate realtime events into daily metrics
CREATE OR REPLACE FUNCTION aggregate_usage_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id UUID;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  -- Get unique tenants from realtime events in last 24 hours
  FOR v_tenant_id IN
    SELECT DISTINCT tenant_id FROM tenant_usage_realtime
    WHERE event_timestamp > NOW() - INTERVAL '1 day'
  LOOP
    v_period_start := DATE_TRUNC('day', NOW() - INTERVAL '1 day');
    v_period_end := DATE_TRUNC('day', NOW());
    
    -- Delete existing daily metric for this period (idempotent)
    DELETE FROM tenant_usage_metrics
    WHERE tenant_id = v_tenant_id
      AND period_type = 'daily'
      AND period_start = v_period_start;
    
    -- Insert aggregated daily metrics
    INSERT INTO tenant_usage_metrics (
      tenant_id,
      period_start,
      period_end,
      period_type,
      api_calls_total,
      api_calls_successful,
      api_calls_failed,
      api_calls_rate_limited,
      api_latency_avg_ms,
      api_latency_p95_ms,
      api_latency_p99_ms,
      chat_messages_sent,
      chat_messages_received,
      chat_sessions_created,
      embeddings_generated,
      embeddings_tokens_used,
      semantic_searches_performed,
      total_tokens_used,
      error_count,
      error_rate,
      peak_qps
    ) SELECT
      v_tenant_id,
      v_period_start,
      v_period_end,
      'daily',
      COUNT(*),
      COUNT(*) FILTER (WHERE api_status_code >= 200 AND api_status_code < 300),
      COUNT(*) FILTER (WHERE api_status_code >= 400),
      COUNT(*) FILTER (WHERE api_status_code = 429),
      AVG(api_response_time_ms),
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY api_response_time_ms),
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY api_response_time_ms),
      COUNT(*) FILTER (WHERE event_type = 'chat_message' AND api_method = 'POST'),
      COUNT(*) FILTER (WHERE event_type = 'chat_message' AND api_method = 'GET'),
      COUNT(DISTINCT chat_session_id) FILTER (WHERE event_type = 'chat_message'),
      COUNT(*) FILTER (WHERE event_type = 'embedding'),
      COALESCE(SUM(embedding_tokens), 0) FILTER (WHERE event_type = 'embedding'),
      COUNT(*) FILTER (WHERE event_type = 'search'),
      COALESCE(SUM(tokens_consumed), 0),
      COUNT(*) FILTER (WHERE api_status_code >= 400),
      ROUND(
        CAST(COUNT(*) FILTER (WHERE api_status_code >= 400) AS FLOAT) /
        NULLIF(COUNT(*), 0) * 100,
        2
      ),
      ROUND(
        CAST(COUNT(*) AS FLOAT) /
        EXTRACT(EPOCH FROM (v_period_end - v_period_start)) * 60,
        2
      )
    FROM tenant_usage_realtime
    WHERE tenant_id = v_tenant_id
      AND event_timestamp >= v_period_start
      AND event_timestamp < v_period_end;
  END LOOP;
END;
$$;

-- Function to check if tenant quota is exceeded
CREATE OR REPLACE FUNCTION check_tenant_quota(p_tenant_id UUID, p_tokens INT DEFAULT 0)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_quota_limit INT;
  v_tokens_used INT;
  v_remaining INT;
BEGIN
  -- Get current period (daily for trial, could be monthly for paid)
  SELECT
    quota_limit,
    total_tokens_used INTO v_quota_limit, v_tokens_used
  FROM tenant_usage_metrics
  WHERE tenant_id = p_tenant_id
    AND period_type = 'daily'
    AND period_start = DATE_TRUNC('day', NOW())
  LIMIT 1;
  
  -- If no quota limit set, allow
  IF v_quota_limit IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if adding p_tokens would exceed quota
  v_remaining := v_quota_limit - COALESCE(v_tokens_used, 0);
  RETURN v_remaining >= p_tokens;
END;
$$;

-- Function to update audit event with resolution
CREATE OR REPLACE FUNCTION resolve_audit_event(
  p_event_id UUID,
  p_resolution_action TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE audit_events
  SET result = 'resolved'
  WHERE event_id = p_event_id;
END;
$$;

-- Cleanup old audit events (retention policy: 2 years)
CREATE OR REPLACE FUNCTION cleanup_old_audit_events()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM audit_events
  WHERE timestamp < NOW() - INTERVAL '2 years';
END;
$$;

-- Cleanup old realtime events (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_realtime_events()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM tenant_usage_realtime
  WHERE event_timestamp < NOW() - INTERVAL '30 days';
END;
$$;

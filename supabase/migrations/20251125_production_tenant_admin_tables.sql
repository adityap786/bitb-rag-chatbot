-- Production-Grade Tenant & Admin Tables Migration
-- Created: 2025-11-25
-- Purpose: Complete multi-tenant system with admin controls

-- ===========================
-- 1. Tenants Table (Main)
-- ===========================
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'provisioning', 'active', 'suspended', 'expired', 'deprovisioning', 'deleted'
  )),
  plan VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (plan IN (
    'trial', 'starter', 'professional', 'enterprise', 'custom'
  )),
  
  -- Quota configuration (JSONB for flexibility)
  quota JSONB NOT NULL DEFAULT '{
    "queries_per_day": 100,
    "queries_per_minute": 10,
    "storage_mb": 50,
    "embeddings_count": 1000,
    "concurrent_sessions": 5,
    "api_calls_per_day": 500,
    "file_uploads_per_day": 10,
    "max_file_size_mb": 10
  }'::jsonb,
  
  -- Feature flags (JSONB)
  features JSONB NOT NULL DEFAULT '{
    "rag_enabled": true,
    "mcp_enabled": false,
    "voice_enabled": false,
    "analytics_enabled": true,
    "custom_branding": false,
    "api_access": true,
    "webhook_integration": false,
    "sso_enabled": false,
    "audit_logging": false,
    "priority_support": false
  }'::jsonb,
  
  -- Branding configuration
  branding JSONB NOT NULL DEFAULT '{
    "primary_color": "#6366f1",
    "secondary_color": "#8b5cf6",
    "widget_position": "bottom-right",
    "chat_tone": "professional",
    "welcome_message": "Hello! How can I help you today?"
  }'::jsonb,
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- Indexes
  CONSTRAINT tenants_email_unique UNIQUE (email)
);

CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_plan ON tenants(plan);
CREATE INDEX idx_tenants_created_at ON tenants(created_at);
CREATE INDEX idx_tenants_expires_at ON tenants(expires_at) WHERE expires_at IS NOT NULL;

-- ===========================
-- 2. Tenant API Keys
-- ===========================
CREATE TABLE IF NOT EXISTS tenant_api_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL, -- SHA256 hash
  key_prefix VARCHAR(8) NOT NULL, -- First 8 chars for identification
  name VARCHAR(100) DEFAULT 'Default API Key',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  scopes TEXT[] DEFAULT ARRAY['query', 'ingest']::TEXT[],
  rate_limit_override JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(255)
);

CREATE INDEX idx_api_keys_tenant ON tenant_api_keys(tenant_id);
CREATE INDEX idx_api_keys_prefix ON tenant_api_keys(key_prefix);
CREATE INDEX idx_api_keys_status ON tenant_api_keys(status);

-- ===========================
-- 3. Tenant Usage Tracking
-- ===========================
CREATE TABLE IF NOT EXISTS tenant_usage (
  usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Counters
  queries_used INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  file_uploads INTEGER NOT NULL DEFAULT 0,
  storage_used_mb DECIMAL(10,2) NOT NULL DEFAULT 0,
  embeddings_count INTEGER NOT NULL DEFAULT 0,
  active_sessions INTEGER NOT NULL DEFAULT 0,
  
  -- Cost tracking (for billing)
  compute_cost_cents INTEGER DEFAULT 0,
  storage_cost_cents INTEGER DEFAULT 0,
  embedding_cost_cents INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(tenant_id, period_start)
);

CREATE INDEX idx_usage_tenant_period ON tenant_usage(tenant_id, period_start);

-- ===========================
-- 4. Onboarding States
-- ===========================
CREATE TABLE IF NOT EXISTS onboarding_states (
  onboarding_id VARCHAR(40) PRIMARY KEY,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  
  current_step VARCHAR(30) NOT NULL DEFAULT 'account_creation' CHECK (current_step IN (
    'account_creation', 'knowledge_base', 'branding', 'widget_config', 
    'deployment', 'verification', 'completed'
  )),
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'paused', 'completed', 'failed', 'abandoned'
  )),
  
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  
  steps_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
  steps_data JSONB NOT NULL DEFAULT '{}',
  
  errors JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_onboarding_tenant ON onboarding_states(tenant_id);
CREATE INDEX idx_onboarding_status ON onboarding_states(status);
CREATE INDEX idx_onboarding_step ON onboarding_states(current_step);

-- ===========================
-- 5. Onboarding Events (Timeline)
-- ===========================
CREATE TABLE IF NOT EXISTS onboarding_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id VARCHAR(40) NOT NULL REFERENCES onboarding_states(onboarding_id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  data JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_events_onboarding ON onboarding_events(onboarding_id);
CREATE INDEX idx_onboarding_events_timestamp ON onboarding_events(timestamp);

-- ===========================
-- 6. Admin Users
-- ===========================
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN (
    'super_admin', 'admin', 'support', 'viewer'
  )),
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- ===========================
-- 7. Admin Audit Log
-- ===========================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_users(admin_id),
  action VARCHAR(100) NOT NULL,
  target_tenant_id VARCHAR(36) REFERENCES tenants(tenant_id),
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_admin ON admin_audit_log(admin_id);
CREATE INDEX idx_audit_tenant ON admin_audit_log(target_tenant_id) WHERE target_tenant_id IS NOT NULL;
CREATE INDEX idx_audit_action ON admin_audit_log(action);
CREATE INDEX idx_audit_timestamp ON admin_audit_log(timestamp);

-- ===========================
-- 8. System Alerts
-- ===========================
CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  tenant_id VARCHAR(36) REFERENCES tenants(tenant_id),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES admin_users(admin_id),
  acknowledged_at TIMESTAMPTZ,
  auto_resolve BOOLEAN DEFAULT FALSE,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_severity ON system_alerts(severity);
CREATE INDEX idx_alerts_acknowledged ON system_alerts(acknowledged);
CREATE INDEX idx_alerts_timestamp ON system_alerts(timestamp);

-- ===========================
-- 9. Widget Configurations
-- ===========================
CREATE TABLE IF NOT EXISTS widget_configs (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(500),
  suggested_questions TEXT[] DEFAULT ARRAY[]::TEXT[],
  enabled_features JSONB DEFAULT '{
    "voice": false,
    "file_upload": false,
    "feedback": true,
    "history": true
  }'::jsonb,
  operating_hours JSONB,
  custom_css TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_widget_configs_tenant ON widget_configs(tenant_id);

-- ===========================
-- 10. Helper Functions
-- ===========================

-- Increment usage counter atomically
CREATE OR REPLACE FUNCTION increment_tenant_usage(
  p_tenant_id VARCHAR(36),
  p_period_start TIMESTAMPTZ,
  p_column VARCHAR(50),
  p_amount INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  INSERT INTO tenant_usage (tenant_id, period_start, period_end)
  VALUES (
    p_tenant_id, 
    p_period_start, 
    p_period_start + INTERVAL '1 day'
  )
  ON CONFLICT (tenant_id, period_start) DO NOTHING;
  
  EXECUTE format(
    'UPDATE tenant_usage SET %I = %I + $1, updated_at = NOW() WHERE tenant_id = $2 AND period_start = $3',
    p_column, p_column
  ) USING p_amount, p_tenant_id, p_period_start;
END;
$$ LANGUAGE plpgsql;

-- Check tenant quota
CREATE OR REPLACE FUNCTION check_tenant_quota(
  p_tenant_id VARCHAR(36),
  p_operation VARCHAR(50)
) RETURNS TABLE (
  allowed BOOLEAN,
  current_usage INTEGER,
  quota_limit INTEGER
) AS $$
DECLARE
  v_quota JSONB;
  v_period_start TIMESTAMPTZ;
  v_current INTEGER;
  v_limit INTEGER;
  v_quota_key VARCHAR(50);
  v_usage_column VARCHAR(50);
BEGIN
  -- Get tenant quota
  SELECT quota INTO v_quota FROM tenants WHERE tenant_id = p_tenant_id;
  
  IF v_quota IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0;
    RETURN;
  END IF;
  
  -- Map operation to quota key and usage column
  CASE p_operation
    WHEN 'query' THEN
      v_quota_key := 'queries_per_day';
      v_usage_column := 'queries_used';
    WHEN 'api_call' THEN
      v_quota_key := 'api_calls_per_day';
      v_usage_column := 'api_calls';
    WHEN 'file_upload' THEN
      v_quota_key := 'file_uploads_per_day';
      v_usage_column := 'file_uploads';
    ELSE
      RETURN QUERY SELECT TRUE, 0, 999999;
      RETURN;
  END CASE;
  
  v_limit := (v_quota->>v_quota_key)::INTEGER;
  v_period_start := DATE_TRUNC('day', NOW());
  
  -- Get current usage
  EXECUTE format(
    'SELECT COALESCE(%I, 0) FROM tenant_usage WHERE tenant_id = $1 AND period_start = $2',
    v_usage_column
  ) INTO v_current USING p_tenant_id, v_period_start;
  
  v_current := COALESCE(v_current, 0);
  
  RETURN QUERY SELECT (v_current < v_limit), v_current, v_limit;
END;
$$ LANGUAGE plpgsql;

-- ===========================
-- 11. RLS Policies
-- ===========================

-- Enable RLS on tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "Service role bypass" ON tenants FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role bypass" ON tenant_api_keys FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role bypass" ON tenant_usage FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role bypass" ON onboarding_states FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role bypass" ON widget_configs FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ===========================
-- 12. Triggers
-- ===========================

-- Update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_onboarding_updated_at
  BEFORE UPDATE ON onboarding_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_widget_configs_updated_at
  BEFORE UPDATE ON widget_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================
-- 13. Initial Admin User (Change password immediately!)
-- ===========================
-- Password: 'ChangeMe123!' hashed with bcrypt
INSERT INTO admin_users (email, name, password_hash, role) 
VALUES (
  'admin@bitb.ltd', 
  'System Admin', 
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4..5VKq0Q4aQEyPG', 
  'super_admin'
) ON CONFLICT (email) DO NOTHING;

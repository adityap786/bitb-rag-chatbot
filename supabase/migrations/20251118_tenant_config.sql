-- Tenant Configuration Table for Admin Controls
-- Stores batch mode, rate limits, and quota settings per tenant

CREATE TABLE IF NOT EXISTS tenant_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE,
  batch_mode_enabled BOOLEAN DEFAULT true,
  max_batch_size INTEGER DEFAULT 5 CHECK (max_batch_size >= 1 AND max_batch_size <= 10),
  rate_limit_per_minute INTEGER DEFAULT 60 CHECK (rate_limit_per_minute >= 10 AND rate_limit_per_minute <= 1000),
  token_quota_per_day INTEGER DEFAULT 10000 CHECK (token_quota_per_day >= 1000 AND token_quota_per_day <= 100000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenant_config_tenant_id ON tenant_config(tenant_id);

-- Enable Row-Level Security
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can access all
CREATE POLICY "Service role full access on tenant_config"
ON tenant_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Authenticated users can only read their own config
CREATE POLICY "Tenants can read own config"
ON tenant_config
FOR SELECT
TO authenticated
USING (
  tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id'
);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
CREATE TRIGGER tenant_config_updated_at
BEFORE UPDATE ON tenant_config
FOR EACH ROW
EXECUTE FUNCTION update_tenant_config_timestamp();

-- Insert default configurations for existing tenants
INSERT INTO tenant_config (tenant_id, batch_mode_enabled, max_batch_size, rate_limit_per_minute, token_quota_per_day)
SELECT 
  tenant_id,
  true,
  5,
  60,
  10000
FROM trial_tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON tenant_config TO authenticated;
GRANT ALL ON tenant_config TO service_role;

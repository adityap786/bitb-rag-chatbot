-- Add features column to trial_tenants for feature flagging
ALTER TABLE trial_tenants 
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN trial_tenants.features IS 'Feature flags and provisioning settings. Example: {"mcp_enabled": true, "llm_enabled": true, "tools": ["calculator", "weather"]}';

-- Create admin_users table if not exists (simple version for now)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  api_key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for admin_users (only service role can access)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

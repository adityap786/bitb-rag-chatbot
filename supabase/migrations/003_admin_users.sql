-- Admin Users Table Migration
-- Creates admin_users table with JWT refresh token support

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT valid_role CHECK (role IN ('super_admin', 'admin', 'viewer'))
);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON public.admin_users(is_active) WHERE is_active = true;

-- Admin Refresh Tokens Table
CREATE TABLE IF NOT EXISTS public.admin_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Create indexes for token lookups
CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_user ON public.admin_refresh_tokens(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_hash ON public.admin_refresh_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_expires ON public.admin_refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_admin_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_users_updated_at();

-- Row Level Security (RLS)
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_users
-- Only service role can access admin_users (no direct client access)
CREATE POLICY admin_users_service_role_all
  ON public.admin_users
  FOR ALL
  USING (auth.role() = 'service_role');

-- RLS Policies for admin_refresh_tokens
CREATE POLICY admin_refresh_tokens_service_role_all
  ON public.admin_refresh_tokens
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to cleanup expired refresh tokens (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_admin_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.admin_refresh_tokens
  WHERE expires_at < now() OR revoked_at IS NOT NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated role
GRANT EXECUTE ON FUNCTION cleanup_expired_admin_tokens() TO service_role;

-- Insert default super admin (password: ChangeMe123! - MUST BE CHANGED)
-- Password hash generated with bcrypt cost 12
INSERT INTO public.admin_users (email, password_hash, full_name, role, is_active)
VALUES (
  'admin@bitb.local',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYVqK7Yq7Gy', -- ChangeMe123!
  'System Administrator',
  'super_admin',
  true
)
ON CONFLICT (email) DO NOTHING;

-- Add comment
COMMENT ON TABLE public.admin_users IS 'Admin users with JWT authentication for protected routes';
COMMENT ON TABLE public.admin_refresh_tokens IS 'JWT refresh tokens for admin users with expiry and revocation support';
COMMENT ON COLUMN public.admin_users.password_hash IS 'Bcrypt hash of user password (cost 12)';
COMMENT ON COLUMN public.admin_users.role IS 'Admin role: super_admin (full access), admin (standard), viewer (read-only)';
COMMENT ON FUNCTION cleanup_expired_admin_tokens() IS 'Removes expired or revoked refresh tokens';

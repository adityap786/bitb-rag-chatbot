-- Migration: Convert all tenant_id columns to TEXT for consistency (full, safe version)
-- Date: 2025-11-22
-- Purpose: Make tenant_id TEXT everywhere for optimal multi-tenant compatibility

BEGIN;

-- 0) Safety: drop dependent foreign keys (child -> parents)
ALTER TABLE IF EXISTS ingestion_jobs DROP CONSTRAINT IF EXISTS ingestion_jobs_tenant_id_fkey;
ALTER TABLE IF EXISTS knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_tenant_id_fkey;
ALTER TABLE IF EXISTS embeddings DROP CONSTRAINT IF EXISTS embeddings_tenant_id_fkey;
ALTER TABLE IF EXISTS widget_configs DROP CONSTRAINT IF EXISTS widget_configs_tenant_id_fkey;
ALTER TABLE IF EXISTS chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_tenant_id_fkey;
ALTER TABLE IF EXISTS crawl_jobs DROP CONSTRAINT IF EXISTS crawl_jobs_tenant_id_fkey;
ALTER TABLE IF EXISTS tenant_users DROP CONSTRAINT IF EXISTS tenant_users_tenant_id_fkey;
ALTER TABLE IF EXISTS bookings DROP CONSTRAINT IF EXISTS bookings_tenant_id_fkey;
ALTER TABLE IF EXISTS conversation_scores DROP CONSTRAINT IF EXISTS conversation_scores_tenant_id_fkey;
ALTER TABLE IF EXISTS analytics_metrics DROP CONSTRAINT IF EXISTS analytics_metrics_tenant_id_fkey;
ALTER TABLE IF EXISTS analytics_metrics_2025_11 DROP CONSTRAINT IF EXISTS analytics_metrics_2025_11_tenant_id_fkey;
ALTER TABLE IF EXISTS analytics_metrics_2025_12 DROP CONSTRAINT IF EXISTS analytics_metrics_2025_12_tenant_id_fkey;
ALTER TABLE IF EXISTS analytics_metrics_2026_01 DROP CONSTRAINT IF EXISTS analytics_metrics_2026_01_tenant_id_fkey;
ALTER TABLE IF EXISTS analytics_metrics_2026_02 DROP CONSTRAINT IF EXISTS analytics_metrics_2026_02_tenant_id_fkey;
ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_tenant_id_fkey;
ALTER TABLE IF EXISTS phi_detection_events DROP CONSTRAINT IF EXISTS phi_detection_events_tenant_id_fkey;
ALTER TABLE IF EXISTS audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey;

DROP POLICY IF EXISTS tenant_isolation_trial ON trial_tenants;
DROP POLICY IF EXISTS tenant_isolation_kb ON knowledge_base;
DROP POLICY IF EXISTS tenant_isolation_embeddings ON embeddings;
DROP POLICY IF EXISTS tenant_isolation_widget ON widget_configs;
DROP POLICY IF EXISTS tenant_isolation_sessions ON chat_sessions;
DROP POLICY IF EXISTS tenant_isolation_crawl ON crawl_jobs;
DROP POLICY IF EXISTS "Service role has full access to ingestion_jobs" ON ingestion_jobs;
DROP POLICY IF EXISTS "Tenants can view their own ingestion jobs" ON ingestion_jobs;
DROP POLICY IF EXISTS "Anon can view trial ingestion jobs" ON ingestion_jobs;

-- Drop analytics_metrics policies that reference tenant_id
DROP POLICY IF EXISTS "Admins can view metrics" ON analytics_metrics;

-- Drop audit_logs policies that reference tenant_id
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;

-- 1a) Enable RLS on analytics_metrics partitions and other flagged tables
ALTER TABLE IF EXISTS public.analytics_metrics_2025_11 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.analytics_metrics_2025_12 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.analytics_metrics_2026_01 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.analytics_metrics_2026_02 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_users ENABLE ROW LEVEL SECURITY;

-- 1b) Add restrictive default policies (block all access until explicit policies are added)
DROP POLICY IF EXISTS "block_all" ON public.analytics_metrics_2025_11;
CREATE POLICY "block_all" ON public.analytics_metrics_2025_11 FOR ALL TO public USING (false);
DROP POLICY IF EXISTS "block_all" ON public.analytics_metrics_2025_12;
CREATE POLICY "block_all" ON public.analytics_metrics_2025_12 FOR ALL TO public USING (false);
DROP POLICY IF EXISTS "block_all" ON public.analytics_metrics_2026_01;
CREATE POLICY "block_all" ON public.analytics_metrics_2026_01 FOR ALL TO public USING (false);
DROP POLICY IF EXISTS "block_all" ON public.analytics_metrics_2026_02;
CREATE POLICY "block_all" ON public.analytics_metrics_2026_02 FOR ALL TO public USING (false);
DROP POLICY IF EXISTS "block_all" ON public.tenants;
CREATE POLICY "block_all" ON public.tenants FOR ALL TO public USING (false);
DROP POLICY IF EXISTS "block_all" ON public.tenant_users;
CREATE POLICY "block_all" ON public.tenant_users FOR ALL TO public USING (false);

-- 2) Convert parent columns to text first
ALTER TABLE IF EXISTS trial_tenants ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS tenants ALTER COLUMN id TYPE text USING id::text;

-- 3) Convert all child tenant_id columns to text
ALTER TABLE IF EXISTS analytics_metrics ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS audit_logs ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS bookings ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS chat_sessions ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS conversation_scores ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS crawl_jobs ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS embeddings ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS ingestion_jobs ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS knowledge_base ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS orders ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS phi_detection_events ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS tenant_users ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
ALTER TABLE IF EXISTS widget_configs ALTER COLUMN tenant_id TYPE text USING tenant_id::text;

-- 4) Recreate foreign keys pointing to text columns
ALTER TABLE IF EXISTS ingestion_jobs ADD CONSTRAINT ingestion_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS knowledge_base ADD CONSTRAINT knowledge_base_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS embeddings ADD CONSTRAINT embeddings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS widget_configs ADD CONSTRAINT widget_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS chat_sessions ADD CONSTRAINT chat_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS crawl_jobs ADD CONSTRAINT crawl_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS tenant_users ADD CONSTRAINT tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS bookings ADD CONSTRAINT bookings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS conversation_scores ADD CONSTRAINT conversation_scores_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS analytics_metrics ADD CONSTRAINT analytics_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS analytics_metrics_2025_11 ADD CONSTRAINT analytics_metrics_2025_11_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS analytics_metrics_2025_12 ADD CONSTRAINT analytics_metrics_2025_12_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS analytics_metrics_2026_01 ADD CONSTRAINT analytics_metrics_2026_01_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS analytics_metrics_2026_02 ADD CONSTRAINT analytics_metrics_2026_02_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS orders ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS phi_detection_events ADD CONSTRAINT phi_detection_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS audit_logs ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS tenant_isolation_trial ON trial_tenants;
CREATE POLICY tenant_isolation_trial ON trial_tenants FOR ALL TO authenticated USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_kb ON knowledge_base;
CREATE POLICY tenant_isolation_kb ON knowledge_base FOR ALL TO authenticated USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_embeddings ON embeddings;
CREATE POLICY tenant_isolation_embeddings ON embeddings FOR ALL TO authenticated USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_widget ON widget_configs;
CREATE POLICY tenant_isolation_widget ON widget_configs FOR ALL TO authenticated USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_sessions ON chat_sessions;
CREATE POLICY tenant_isolation_sessions ON chat_sessions FOR ALL TO authenticated USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_crawl ON crawl_jobs;
CREATE POLICY tenant_isolation_crawl ON crawl_jobs FOR ALL TO authenticated USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS "Service role has full access to ingestion_jobs" ON ingestion_jobs;
CREATE POLICY "Service role has full access to ingestion_jobs" ON ingestion_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tenants can view their own ingestion jobs" ON ingestion_jobs;
CREATE POLICY "Tenants can view their own ingestion jobs" ON ingestion_jobs FOR SELECT TO authenticated USING (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS "Anon can view trial ingestion jobs" ON ingestion_jobs;
CREATE POLICY "Anon can view trial ingestion jobs" ON ingestion_jobs FOR SELECT TO anon USING (
  tenant_id IN (
    SELECT tenant_id FROM trial_tenants 
    WHERE setup_token = current_setting('request.jwt.claims', true)::json->>'trial_token'
  )
);

-- Recreate analytics_metrics policies
DROP POLICY IF EXISTS "Admins can view metrics" ON analytics_metrics;
CREATE POLICY "Admins can view metrics" ON analytics_metrics FOR SELECT TO admin USING (true);

-- Recreate audit_logs policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT TO admin USING (true);

-- 6) Recreate helpful indexes
CREATE INDEX IF NOT EXISTS idx_trial_tenants_tenant_id_text ON trial_tenants (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant_id_text ON ingestion_jobs (tenant_id);

COMMIT;

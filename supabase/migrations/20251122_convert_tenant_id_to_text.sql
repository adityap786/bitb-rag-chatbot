-- Migration: Convert all tenant_id columns to TEXT for consistency
-- Date: 2025-11-22
-- Purpose: Make tenant_id TEXT everywhere for optimal multi-tenant compatibility

BEGIN;

-- Step 1: Drop all policies on trial_tenants that reference tenant_id
DROP POLICY IF EXISTS tenant_isolation_trial ON trial_tenants;

-- Step 2: Drop all foreign key constraints referencing trial_tenants.tenant_id
ALTER TABLE ingestion_jobs DROP CONSTRAINT IF EXISTS ingestion_jobs_tenant_id_fkey;
ALTER TABLE knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_tenant_id_fkey;
ALTER TABLE embeddings DROP CONSTRAINT IF EXISTS embeddings_tenant_id_fkey;
ALTER TABLE widget_configs DROP CONSTRAINT IF EXISTS widget_configs_tenant_id_fkey;
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_tenant_id_fkey;

-- Step 3: Convert trial_tenants.tenant_id to TEXT
ALTER TABLE trial_tenants ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;

-- Step 4: Convert all child table tenant_id columns to TEXT
ALTER TABLE ingestion_jobs ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
ALTER TABLE knowledge_base ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
ALTER TABLE embeddings ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
ALTER TABLE widget_configs ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
ALTER TABLE chat_sessions ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;

-- Step 5: Recreate foreign key constraints
ALTER TABLE ingestion_jobs ADD CONSTRAINT ingestion_jobs_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
  
ALTER TABLE knowledge_base ADD CONSTRAINT knowledge_base_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
  
ALTER TABLE embeddings ADD CONSTRAINT embeddings_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
  
ALTER TABLE widget_configs ADD CONSTRAINT widget_configs_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;
  
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE;

-- Step 6: Recreate RLS policies on trial_tenants (TEXT comparisons)
CREATE POLICY tenant_isolation_trial ON trial_tenants
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid()::text);

-- Step 7: Recreate RLS policies on ingestion_jobs (TEXT comparisons)
DROP POLICY IF EXISTS "Service role has full access to ingestion_jobs" ON ingestion_jobs;
DROP POLICY IF EXISTS "Tenants can view their own ingestion jobs" ON ingestion_jobs;
DROP POLICY IF EXISTS "Anon can view trial ingestion jobs" ON ingestion_jobs;

CREATE POLICY "Service role has full access to ingestion_jobs"
  ON ingestion_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Tenants can view their own ingestion jobs"
  ON ingestion_jobs FOR SELECT TO authenticated
  USING (tenant_id = auth.uid()::text);

CREATE POLICY "Anon can view trial ingestion jobs"
  ON ingestion_jobs FOR SELECT TO anon
  USING (
    tenant_id IN (
      SELECT tenant_id FROM trial_tenants 
      WHERE setup_token = current_setting('request.jwt.claims', true)::json->>'trial_token'
    )
  );

COMMIT;

-- Comments for maintainers:
-- All tenant_id columns are now TEXT. Update any application code or queries to use TEXT for tenant_id.
-- If you have additional tables with tenant_id as UUID, repeat the ALTER COLUMN ... TYPE TEXT USING ... pattern.

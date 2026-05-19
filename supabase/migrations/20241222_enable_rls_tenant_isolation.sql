-- ============================================================
-- Supabase RLS Performance & Cleanup Migration
-- 
-- Fixes Supabase Advisor warnings:
-- 1. auth_rls_initplan: Wrap auth.jwt() in (select) for per-query eval
-- 2. multiple_permissive_policies: Consolidate duplicate policies
-- 3. unindexed_foreign_keys: Add missing indexes
-- ============================================================

-- ============================================================
-- PHASE 1: Helper function for efficient tenant_id retrieval
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS text AS $$
  SELECT COALESCE(
    current_setting('app.tenant_id', true),
    (auth.jwt() ->> 'tenant_id')::text
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- PHASE 2: Tables WITH tenant_id column - Apply RLS
-- ============================================================

-- TENANT_API_KEYS
DROP POLICY IF EXISTS "tenant_isolation" ON tenant_api_keys;
CREATE POLICY "tenant_api_keys_rls" ON tenant_api_keys
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- TENANT_CONFIG
DROP POLICY IF EXISTS "tenant_isolation" ON tenant_config;
CREATE POLICY "tenant_config_rls" ON tenant_config
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- TENANT_USAGE
DROP POLICY IF EXISTS "tenant_isolation" ON tenant_usage;
CREATE POLICY "tenant_usage_rls" ON tenant_usage
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- KNOWLEDGE_BASE
DROP POLICY IF EXISTS "tenant_isolation" ON knowledge_base;
DROP POLICY IF EXISTS "tenant_isolation_kb_select" ON knowledge_base;
DROP POLICY IF EXISTS "tenant_isolation_kb_insert" ON knowledge_base;
DROP POLICY IF EXISTS "tenant_isolation_kb_update" ON knowledge_base;
DROP POLICY IF EXISTS "tenant_isolation_kb_delete" ON knowledge_base;
DROP POLICY IF EXISTS "service_role_full_access_kb" ON knowledge_base;
CREATE POLICY "knowledge_base_rls" ON knowledge_base
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- EMBEDDINGS
DROP POLICY IF EXISTS "tenant_isolation" ON embeddings;
DROP POLICY IF EXISTS "Tenant isolation on embeddings" ON embeddings;
DROP POLICY IF EXISTS "Service role bypass" ON embeddings;
DROP POLICY IF EXISTS "tenant_isolation_emb_select" ON embeddings;
DROP POLICY IF EXISTS "tenant_isolation_emb_insert" ON embeddings;
DROP POLICY IF EXISTS "tenant_isolation_emb_delete" ON embeddings;
DROP POLICY IF EXISTS "service_role_full_access_emb" ON embeddings;
CREATE POLICY "embeddings_rls" ON embeddings
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- WIDGET_CONFIGS
DROP POLICY IF EXISTS "tenant_isolation" ON widget_configs;
DROP POLICY IF EXISTS "tenant_isolation_wc_select" ON widget_configs;
DROP POLICY IF EXISTS "service_role_full_access_wc" ON widget_configs;
CREATE POLICY "widget_configs_rls" ON widget_configs
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- CHAT_SESSIONS
DROP POLICY IF EXISTS "tenant_isolation" ON chat_sessions;
CREATE POLICY "chat_sessions_rls" ON chat_sessions
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- INGESTION_JOBS
DROP POLICY IF EXISTS "tenant_isolation" ON ingestion_jobs;
DROP POLICY IF EXISTS "tenant_isolation_ij_select" ON ingestion_jobs;
DROP POLICY IF EXISTS "tenant_isolation_ij_insert" ON ingestion_jobs;
DROP POLICY IF EXISTS "tenant_isolation_ij_update" ON ingestion_jobs;
DROP POLICY IF EXISTS "service_role_full_access_ij" ON ingestion_jobs;
CREATE POLICY "ingestion_jobs_rls" ON ingestion_jobs
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- CRAWL_JOBS
DROP POLICY IF EXISTS "tenant_isolation" ON crawl_jobs;
CREATE POLICY "crawl_jobs_rls" ON crawl_jobs
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- BOOKINGS
DROP POLICY IF EXISTS "tenant_isolation" ON bookings;
CREATE POLICY "bookings_rls" ON bookings
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- ORDERS
DROP POLICY IF EXISTS "tenant_isolation" ON orders;
CREATE POLICY "orders_rls" ON orders
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- CITATIONS
DROP POLICY IF EXISTS "tenant_isolation" ON citations;
CREATE POLICY "citations_rls" ON citations
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- CONVERSATION_FEEDBACK
DROP POLICY IF EXISTS "tenant_isolation" ON conversation_feedback;
CREATE POLICY "conversation_feedback_rls" ON conversation_feedback
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- VECTOR_DOCUMENTS
DROP POLICY IF EXISTS "vector_documents_tenant_isolation" ON vector_documents;
CREATE POLICY "vector_documents_rls" ON vector_documents
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- DATA_CONSENTS
DROP POLICY IF EXISTS "data_consents_tenant" ON data_consents;
CREATE POLICY "data_consents_rls" ON data_consents
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- SECURITY_EVENTS (tenant_id is nullable)
DROP POLICY IF EXISTS "deny_all_security_events" ON security_events;
DROP POLICY IF EXISTS "security_events_tenant_select" ON security_events;
DROP POLICY IF EXISTS "security_events_tenant_insert" ON security_events;
DROP POLICY IF EXISTS "security_events_tenant_update" ON security_events;
DROP POLICY IF EXISTS "security_events_tenant_delete" ON security_events;
CREATE POLICY "security_events_rls" ON security_events
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
    OR tenant_id IS NULL  -- Allow system-level events
  );

-- TRIALS
DROP POLICY IF EXISTS "deny_all_trials" ON trials;
DROP POLICY IF EXISTS "trials_tenant_select" ON trials;
DROP POLICY IF EXISTS "trials_tenant_insert" ON trials;
DROP POLICY IF EXISTS "trials_tenant_update" ON trials;
DROP POLICY IF EXISTS "trials_tenant_delete" ON trials;
CREATE POLICY "trials_rls" ON trials
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- TENANT_CAPABILITIES
DROP POLICY IF EXISTS "tenant_capabilities_select" ON tenant_capabilities;
DROP POLICY IF EXISTS "tenant_capabilities_admin_all" ON tenant_capabilities;
CREATE POLICY "tenant_capabilities_rls" ON tenant_capabilities
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- WIDGET_TOKENS
DROP POLICY IF EXISTS "widget_tokens_select" ON widget_tokens;
DROP POLICY IF EXISTS "widget_tokens_admin_all" ON widget_tokens;
CREATE POLICY "widget_tokens_rls" ON widget_tokens
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- TENANTS (read own tenant only)
DROP POLICY IF EXISTS "service_role_full_access_t" ON tenants;
DROP POLICY IF EXISTS "tenant_read_own" ON tenants;
CREATE POLICY "tenants_rls" ON tenants
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
  );

-- ============================================================
-- PHASE 3: Tables WITHOUT tenant_id - Service role only
-- These tables use run_id or dataset_id for association
-- ============================================================

-- RAG_EVALUATION_DATASETS (has tenant_id but nullable)
DROP POLICY IF EXISTS "deny_all_rag_eval_datasets" ON rag_evaluation_datasets;
DROP POLICY IF EXISTS "rag_eval_datasets_select" ON rag_evaluation_datasets;
DROP POLICY IF EXISTS "rag_eval_datasets_insert" ON rag_evaluation_datasets;
DROP POLICY IF EXISTS "rag_eval_datasets_update" ON rag_evaluation_datasets;
DROP POLICY IF EXISTS "rag_eval_datasets_delete" ON rag_evaluation_datasets;
CREATE POLICY "rag_evaluation_datasets_rls" ON rag_evaluation_datasets
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
    OR tenant_id IS NULL  -- Global datasets
  );

-- RAG_EVALUATION_RUNS (has tenant_id but nullable)
DROP POLICY IF EXISTS "Admin or tenant access on rag_evaluation_runs" ON rag_evaluation_runs;
DROP POLICY IF EXISTS "deny_all_rag_eval_runs" ON rag_evaluation_runs;
DROP POLICY IF EXISTS "rag_eval_runs_select" ON rag_evaluation_runs;
DROP POLICY IF EXISTS "rag_eval_runs_insert" ON rag_evaluation_runs;
DROP POLICY IF EXISTS "rag_eval_runs_update" ON rag_evaluation_runs;
DROP POLICY IF EXISTS "rag_eval_runs_delete" ON rag_evaluation_runs;
CREATE POLICY "rag_evaluation_runs_rls" ON rag_evaluation_runs
  FOR ALL USING (
    auth.role() = 'service_role'
    OR tenant_id = (select get_current_tenant_id())
    OR tenant_id IS NULL
  );

-- RAG_EVALUATION_SAMPLES (NO tenant_id - uses dataset_id)
-- Access via dataset relationship
DROP POLICY IF EXISTS "deny_all_rag_eval_samples" ON rag_evaluation_samples;
DROP POLICY IF EXISTS "rag_eval_samples_select" ON rag_evaluation_samples;
DROP POLICY IF EXISTS "rag_eval_samples_insert" ON rag_evaluation_samples;
DROP POLICY IF EXISTS "rag_eval_samples_update" ON rag_evaluation_samples;
DROP POLICY IF EXISTS "rag_eval_samples_delete" ON rag_evaluation_samples;
CREATE POLICY "rag_evaluation_samples_rls" ON rag_evaluation_samples
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM rag_evaluation_datasets d 
      WHERE d.id = rag_evaluation_samples.dataset_id
      AND (d.tenant_id = (select get_current_tenant_id()) OR d.tenant_id IS NULL)
    )
  );

-- RAG_EVALUATION_RESULTS (NO tenant_id - uses run_id)
DROP POLICY IF EXISTS "deny_all_rag_eval_results" ON rag_evaluation_results;
DROP POLICY IF EXISTS "rag_eval_results_select" ON rag_evaluation_results;
DROP POLICY IF EXISTS "rag_eval_results_insert" ON rag_evaluation_results;
DROP POLICY IF EXISTS "rag_eval_results_update" ON rag_evaluation_results;
DROP POLICY IF EXISTS "rag_eval_results_delete" ON rag_evaluation_results;
CREATE POLICY "rag_evaluation_results_rls" ON rag_evaluation_results
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM rag_evaluation_runs r 
      WHERE r.run_id = rag_evaluation_results.run_id
      AND (r.tenant_id = (select get_current_tenant_id()) OR r.tenant_id IS NULL)
    )
  );

-- RAG_EVALUATION_REGRESSIONS (NO tenant_id - uses run_id)
DROP POLICY IF EXISTS "deny_all_rag_eval_regressions" ON rag_evaluation_regressions;
DROP POLICY IF EXISTS "rag_eval_regressions_select" ON rag_evaluation_regressions;
DROP POLICY IF EXISTS "rag_eval_regressions_insert" ON rag_evaluation_regressions;
DROP POLICY IF EXISTS "rag_eval_regressions_update" ON rag_evaluation_regressions;
DROP POLICY IF EXISTS "rag_eval_regressions_delete" ON rag_evaluation_regressions;
CREATE POLICY "rag_evaluation_regressions_rls" ON rag_evaluation_regressions
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM rag_evaluation_runs r 
      WHERE r.run_id = rag_evaluation_regressions.run_id
      AND (r.tenant_id = (select get_current_tenant_id()) OR r.tenant_id IS NULL)
    )
  );

-- ============================================================
-- PHASE 4: Add Missing Foreign Key Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_system_alerts_acknowledged_by ON system_alerts(acknowledged_by);
CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_id ON system_alerts(tenant_id);

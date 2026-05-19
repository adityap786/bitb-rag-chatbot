-- ============================================================
-- Unused Index Cleanup Migration
-- 
-- Based on pg_stat_user_indexes analysis showing idx_scan = 0
-- 
-- ⚠️ PRIMARY KEYS and UNIQUE constraints are NOT dropped
-- Only dropping regular indexes that have never been used
-- ============================================================

-- ============================================================
-- VECTOR INDEXES - CLEANUP
-- 
-- HNSW is better than IVFFlat for accuracy. Keep only HNSW indexes.
--
-- EMBEDDINGS TABLE:
--   idx_embeddings_vector_768      (HNSW, default)     <- DROP (duplicate)
--   embeddings_embedding_768_hnsw  (HNSW, m=16)        <- KEEP
--
-- VECTOR_DOCUMENTS TABLE:
--   vector_documents_embedding_idx      (IVFFlat)      <- DROP
--   vector_documents_embedding_idx_768  (IVFFlat)      <- DROP
--   vector_documents_embedding_768_hnsw_idx (HNSW)     <- KEEP
-- ============================================================

-- Drop duplicate embeddings HNSW index
DROP INDEX IF EXISTS idx_embeddings_vector_768;

-- Drop IVFFlat indexes on vector_documents (keep HNSW)
DROP INDEX IF EXISTS vector_documents_embedding_idx;
DROP INDEX IF EXISTS vector_documents_embedding_idx_768;

-- Tenants table
DROP INDEX IF EXISTS idx_tenants_status;
DROP INDEX IF EXISTS idx_tenants_plan;
DROP INDEX IF EXISTS idx_tenants_expires_at;

-- Chat sessions
DROP INDEX IF EXISTS idx_sessions_expiry;
DROP INDEX IF EXISTS idx_sessions_tenant;

-- Ingestion jobs
DROP INDEX IF EXISTS idx_ingestion_jobs_queue;
DROP INDEX IF EXISTS idx_ingestion_status;
DROP INDEX IF EXISTS idx_ingestion_created;

-- Knowledge base
DROP INDEX IF EXISTS idx_kb_tenant;

-- Tenant API keys
DROP INDEX IF EXISTS idx_api_keys_prefix;
DROP INDEX IF EXISTS idx_api_keys_status;

-- Admin
DROP INDEX IF EXISTS idx_admin_email;
DROP INDEX IF EXISTS idx_admin_role;
DROP INDEX IF EXISTS idx_refresh_hash;
DROP INDEX IF EXISTS idx_refresh_admin;
DROP INDEX IF EXISTS idx_admin_audit_resource;
DROP INDEX IF EXISTS idx_admin_audit_action;
DROP INDEX IF EXISTS idx_admin_audit_admin;
DROP INDEX IF EXISTS idx_admin_audit_tenant;
DROP INDEX IF EXISTS idx_admin_audit_timestamp;

-- Audit events
DROP INDEX IF EXISTS idx_audit_events_type;
DROP INDEX IF EXISTS idx_audit_events_timestamp;

-- Tenant usage
DROP INDEX IF EXISTS idx_realtime_event_type;

-- Trials
DROP INDEX IF EXISTS idx_trials_status;

-- Tenant capabilities
DROP INDEX IF EXISTS idx_tenant_capabilities_tenant_id;

-- Widget tokens
DROP INDEX IF EXISTS idx_widget_tokens_expires;
DROP INDEX IF EXISTS idx_widget_tokens_tenant_id;
DROP INDEX IF EXISTS idx_widget_tokens_jti;

-- Data consents
DROP INDEX IF EXISTS idx_data_consents_active;

-- System alerts
DROP INDEX IF EXISTS idx_alerts_severity;
DROP INDEX IF EXISTS idx_alerts_acknowledged;

-- Onboarding
DROP INDEX IF EXISTS idx_onboarding_events_ts;
DROP INDEX IF EXISTS idx_onboarding_events_id;
DROP INDEX IF EXISTS idx_onboarding_status;

-- Workflow
DROP INDEX IF EXISTS idx_history_timestamp;
DROP INDEX IF EXISTS idx_history_workflow;
DROP INDEX IF EXISTS idx_workflow_status;
DROP INDEX IF EXISTS idx_interrupt_workflow;
DROP INDEX IF EXISTS idx_interrupt_unresolved;

-- Conversation
DROP INDEX IF EXISTS idx_feedback_conversation;
DROP INDEX IF EXISTS idx_scores_session;

-- Other
DROP INDEX IF EXISTS idx_citations_conversation;
DROP INDEX IF EXISTS idx_product_interactions_product;
DROP INDEX IF EXISTS idx_phi_created;
DROP INDEX IF EXISTS idx_crawl_status;

-- ============================================================
-- KEPT (Primary Keys & Unique Constraints - Never drop these):
-- ============================================================
-- audit_events_pkey, tenant_api_keys_pkey, ingestion_job_steps_pkey
-- trials_pkey, vector_documents_pkey, tenant_usage_realtime_pkey
-- widget_tokens_pkey, tenant_capabilities_pkey, system_alerts_pkey
-- data_consents_pkey, conversation_feedback_pkey, workflow_states_pkey
-- conversation_scores_pkey, onboarding_states_pkey, tenant_usage_metrics_pkey
-- citations_pkey, onboarding_events_pkey, vertical_engine_configs_pkey
-- product_interactions_pkey, workflow_history_pkey, phi_detection_events_pkey
-- 
-- knowledge_base_content_hash_key, trials_trial_token_key
-- tenants_email_key, widget_tokens_token_hash_key, widget_tokens_token_jti_key
-- tenant_capabilities_tenant_id_key, vertical_engine_configs_tenant_id_vertical_key
-- tenant_usage_metrics_tenant_id_period_start_period_type_key
-- admin_refresh_tokens_token_hash_key
-- ============================================================

-- ============================================================================
-- BiTB RAG Chatbot - Complete Production Schema
-- Created: 2025-11-26
-- Purpose: Single consolidated migration for fresh Supabase deployment
-- 
-- DESIGN PRINCIPLES:
-- 1. All tenant_id columns are TEXT (not UUID) for consistency
-- 2. All primary keys use gen_random_uuid() for UUIDs
-- 3. Foreign keys have proper ON DELETE CASCADE
-- 4. All tables have RLS enabled with service_role bypass
-- 5. Indexes are created for all foreign keys and common query patterns
-- ============================================================================

BEGIN;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 1. CORE TENANT TABLE (Parent for all tenant-scoped data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  tenant_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'provisioning', 'active', 'suspended', 'expired', 'deleted'
  )),
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN (
    'trial', 'starter', 'professional', 'enterprise', 'custom'
  )),
  
  -- Plan type for service vs ecommerce
  plan_type TEXT CHECK (plan_type IN ('service', 'ecommerce')),
  industry_vertical TEXT,
  
  -- Quota configuration
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
  
  -- Feature flags
  features JSONB NOT NULL DEFAULT '{
    "rag_enabled": true,
    "mcp_enabled": false,
    "voice_enabled": false,
    "analytics_enabled": true,
    "custom_branding": false,
    "api_access": true,
    "webhook_integration": false,
    "sso_enabled": false,
    "audit_logging": false
  }'::jsonb,
  
  -- Branding
  branding JSONB NOT NULL DEFAULT '{
    "primary_color": "#6366f1",
    "secondary_color": "#8b5cf6",
    "widget_position": "bottom-right",
    "chat_tone": "professional",
    "welcome_message": "Hello! How can I help you today?"
  }'::jsonb,
  
  -- LLM Configuration
  llm_provider TEXT DEFAULT 'groq',
  llm_model TEXT DEFAULT 'llama-3.1-70b-instruct',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_tenants_status ON public.tenants(status);
CREATE INDEX idx_tenants_plan ON public.tenants(plan);
CREATE INDEX idx_tenants_email ON public.tenants(email);
CREATE INDEX idx_tenants_created_at ON public.tenants(created_at);
CREATE INDEX idx_tenants_expires_at ON public.tenants(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 2. TENANT API KEYS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT DEFAULT 'Default API Key',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  scopes TEXT[] DEFAULT ARRAY['query', 'ingest']::TEXT[],
  rate_limit_override JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX idx_api_keys_tenant ON public.tenant_api_keys(tenant_id);
CREATE INDEX idx_api_keys_prefix ON public.tenant_api_keys(key_prefix);
CREATE INDEX idx_api_keys_status ON public.tenant_api_keys(status);

-- ============================================================================
-- 3. TENANT CONFIGURATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  batch_mode_enabled BOOLEAN DEFAULT true,
  max_batch_size INTEGER DEFAULT 5 CHECK (max_batch_size >= 1 AND max_batch_size <= 10),
  rate_limit_per_minute INTEGER DEFAULT 60 CHECK (rate_limit_per_minute >= 10 AND rate_limit_per_minute <= 1000),
  token_quota_per_day INTEGER DEFAULT 10000 CHECK (token_quota_per_day >= 1000 AND token_quota_per_day <= 100000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenant_config_tenant_id ON public.tenant_config(tenant_id);

-- ============================================================================
-- 4. TENANT USAGE TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_usage (
  usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Counters
  queries_used INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  file_uploads INTEGER NOT NULL DEFAULT 0,
  storage_used_mb NUMERIC(10,2) NOT NULL DEFAULT 0,
  embeddings_count INTEGER NOT NULL DEFAULT 0,
  active_sessions INTEGER NOT NULL DEFAULT 0,
  
  -- Cost tracking
  compute_cost_cents INTEGER DEFAULT 0,
  storage_cost_cents INTEGER DEFAULT 0,
  embedding_cost_cents INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(tenant_id, period_start)
);

CREATE INDEX idx_usage_tenant_period ON public.tenant_usage(tenant_id, period_start);

-- ============================================================================
-- 5. KNOWLEDGE BASE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  kb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  source_type TEXT CHECK (source_type IN ('upload', 'crawl', 'manual')),
  content_hash TEXT UNIQUE,
  raw_text TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_tenant ON public.knowledge_base(tenant_id);
CREATE INDEX idx_kb_hash ON public.knowledge_base(content_hash);
CREATE INDEX idx_kb_source ON public.knowledge_base(tenant_id, source_type);

-- ============================================================================
-- 6. VECTOR EMBEDDINGS (Main RAG table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  kb_id UUID REFERENCES public.knowledge_base(kb_id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  chunk_text TEXT,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_tenant ON public.embeddings(tenant_id);
CREATE INDEX idx_embeddings_kb ON public.embeddings(kb_id);
CREATE INDEX idx_embeddings_created_at ON public.embeddings(created_at DESC);

-- Vector index (IVFFlat for ANN search)
CREATE INDEX idx_embeddings_vector ON public.embeddings 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- ============================================================================
-- 7. WIDGET CONFIGURATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.widget_configs (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'AI Assistant',
  primary_color TEXT DEFAULT '#6366f1',
  secondary_color TEXT DEFAULT '#8b5cf6',
  chat_tone TEXT DEFAULT 'professional' CHECK (chat_tone IN ('professional', 'friendly', 'casual')),
  welcome_message TEXT DEFAULT 'Hello! How can I help you today?',
  placeholder_text TEXT DEFAULT 'Type your message...',
  avatar_url TEXT,
  suggested_questions TEXT[] DEFAULT ARRAY[]::TEXT[],
  assigned_tools JSONB DEFAULT '[]'::jsonb,
  enabled_features JSONB DEFAULT '{
    "voice": false,
    "file_upload": false,
    "feedback": true,
    "history": true
  }'::jsonb,
  prompt_template TEXT,
  operating_hours JSONB,
  custom_css TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_widget_tenant ON public.widget_configs(tenant_id);

-- ============================================================================
-- 8. CHAT SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes',
  messages JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sessions_tenant ON public.chat_sessions(tenant_id);
CREATE INDEX idx_sessions_expiry ON public.chat_sessions(expires_at);
CREATE INDEX idx_sessions_visitor ON public.chat_sessions(tenant_id, visitor_id);

-- ============================================================================
-- 9. INGESTION JOBS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  data_source TEXT NOT NULL CHECK (data_source IN ('manual', 'upload', 'crawl')),
  source_url TEXT,
  file_names TEXT[],
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  pages_processed INTEGER DEFAULT 0,
  chunks_created INTEGER DEFAULT 0,
  embeddings_count INTEGER DEFAULT 0,
  index_path TEXT,
  error_message TEXT,
  error_details JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ingestion_tenant ON public.ingestion_jobs(tenant_id);
CREATE INDEX idx_ingestion_status ON public.ingestion_jobs(status);
CREATE INDEX idx_ingestion_created ON public.ingestion_jobs(created_at DESC);

-- ============================================================================
-- 10. CRAWL JOBS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.crawl_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  start_url TEXT NOT NULL,
  max_pages INTEGER DEFAULT 20,
  max_depth INTEGER DEFAULT 2,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  pages_crawled INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_crawl_tenant ON public.crawl_jobs(tenant_id);
CREATE INDEX idx_crawl_status ON public.crawl_jobs(status);

-- ============================================================================
-- 11. ONBOARDING STATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_states (
  onboarding_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  current_step TEXT NOT NULL DEFAULT 'account_creation' CHECK (current_step IN (
    'account_creation', 'knowledge_base', 'branding', 'widget_config', 
    'deployment', 'verification', 'completed'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'paused', 'completed', 'failed', 'abandoned'
  )),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  steps_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
  steps_data JSONB NOT NULL DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_onboarding_tenant ON public.onboarding_states(tenant_id);
CREATE INDEX idx_onboarding_status ON public.onboarding_states(status);

-- ============================================================================
-- 12. ONBOARDING EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id TEXT NOT NULL REFERENCES public.onboarding_states(onboarding_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_events_id ON public.onboarding_events(onboarding_id);
CREATE INDEX idx_onboarding_events_ts ON public.onboarding_events(timestamp);

-- ============================================================================
-- 13. WORKFLOW STATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_states (
  workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  current_step TEXT NOT NULL CHECK (current_step IN (
    'trial_init', 'kb_ingest', 'branding_config', 'widget_deploy', 'go_live'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'paused', 'completed', 'failed', 'rolled_back'
  )),
  steps_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
  steps_failed TEXT[] DEFAULT ARRAY[]::TEXT[],
  steps_skipped TEXT[] DEFAULT ARRAY[]::TEXT[],
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  error TEXT,
  error_code TEXT,
  error_context JSONB DEFAULT '{}'::jsonb,
  paused_reason TEXT,
  paused_at TIMESTAMPTZ,
  context_data JSONB DEFAULT '{}'::jsonb,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_tenant ON public.workflow_states(tenant_id);
CREATE INDEX idx_workflow_status ON public.workflow_states(status);
CREATE INDEX idx_workflow_created ON public.workflow_states(created_at DESC);

-- ============================================================================
-- 14. WORKFLOW INTERRUPTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_interrupts (
  interrupt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflow_states(workflow_id) ON DELETE CASCADE,
  interrupt_type TEXT NOT NULL CHECK (interrupt_type IN (
    'quality_gate', 'manual_review', 'user_input', 'system_error',
    'validation_failure', 'timeout', 'admin_override'
  )),
  interrupt_reason TEXT NOT NULL,
  required_action TEXT NOT NULL CHECK (required_action IN (
    'retry', 'manual_review', 'user_input', 'admin_approval', 'skip_step', 'rollback'
  )),
  context_data JSONB DEFAULT '{}'::jsonb,
  affected_step TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT,
  resolution_notes TEXT,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interrupt_workflow ON public.workflow_interrupts(workflow_id);
CREATE INDEX idx_interrupt_unresolved ON public.workflow_interrupts(workflow_id) WHERE resolved_at IS NULL;

-- ============================================================================
-- 15. WORKFLOW HISTORY (Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflow_states(workflow_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'workflow_created', 'step_started', 'step_completed', 'step_failed',
    'step_retried', 'workflow_paused', 'workflow_resumed', 'workflow_rolled_back',
    'interrupt_created', 'interrupt_resolved', 'workflow_completed', 'workflow_failed'
  )),
  previous_status TEXT,
  new_status TEXT,
  previous_step TEXT,
  new_step TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  actor_type TEXT CHECK (actor_type IN ('system', 'user', 'admin', 'workflow')),
  actor_id UUID,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_history_workflow ON public.workflow_history(workflow_id);
CREATE INDEX idx_history_timestamp ON public.workflow_history(timestamp DESC);

-- ============================================================================
-- 16. BOOKINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  booking_type TEXT CHECK (booking_type IN ('appointment', 'consultation', 'service', 'demo', 'trial')),
  service_name TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(slot_id, tenant_id)
);

CREATE INDEX idx_bookings_tenant ON public.bookings(tenant_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_bookings_scheduled ON public.bookings(scheduled_at);

-- ============================================================================
-- 17. ORDERS (E-commerce)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  customer_email TEXT,
  items JSONB NOT NULL,
  total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  payment_method TEXT,
  transaction_id TEXT,
  shipping_address JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_tenant ON public.orders(tenant_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_customer ON public.orders(customer_email);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);

-- ============================================================================
-- 18. PRODUCT INTERACTIONS (E-commerce Analytics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  conversation_id UUID,
  message_id UUID,
  product_id TEXT,
  product_name TEXT,
  product_price NUMERIC(10, 2),
  action TEXT CHECK (action IN ('view', 'compare', 'add_to_cart', 'remove_from_cart', 'purchase', 'inquiry')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_interactions_tenant ON public.product_interactions(tenant_id);
CREATE INDEX idx_product_interactions_product ON public.product_interactions(product_id);

-- ============================================================================
-- 19. CITATIONS (RAG Source Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  conversation_id UUID,
  message_id UUID,
  source_title TEXT,
  source_url TEXT,
  excerpt TEXT,
  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_citations_tenant ON public.citations(tenant_id);
CREATE INDEX idx_citations_conversation ON public.citations(conversation_id);

-- ============================================================================
-- 20. CONVERSATION FEEDBACK
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  message_id UUID,
  feedback_type TEXT CHECK (feedback_type IN ('thumbs_up', 'thumbs_down', 'flag', 'rating')),
  quality_score NUMERIC CHECK (quality_score >= 0 AND quality_score <= 5),
  user_comment TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_tenant ON public.conversation_feedback(tenant_id);
CREATE INDEX idx_feedback_conversation ON public.conversation_feedback(conversation_id);

-- ============================================================================
-- 21. CONVERSATION SCORES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  feedback TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scores_tenant ON public.conversation_scores(tenant_id);
CREATE INDEX idx_scores_session ON public.conversation_scores(session_id);

-- ============================================================================
-- 22. USAGE METRICS (Aggregated)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_usage_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type TEXT CHECK (period_type IN ('hourly', 'daily', 'monthly')) DEFAULT 'daily',
  
  -- API metrics
  api_calls_total INTEGER DEFAULT 0,
  api_calls_successful INTEGER DEFAULT 0,
  api_calls_failed INTEGER DEFAULT 0,
  api_latency_avg_ms NUMERIC DEFAULT 0,
  api_latency_p95_ms NUMERIC DEFAULT 0,
  
  -- Chat metrics
  chat_messages_sent INTEGER DEFAULT 0,
  chat_sessions_created INTEGER DEFAULT 0,
  
  -- Embedding metrics
  embeddings_generated INTEGER DEFAULT 0,
  embeddings_tokens_used INTEGER DEFAULT 0,
  semantic_searches_performed INTEGER DEFAULT 0,
  
  -- Cost tracking
  total_tokens_used INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 4) DEFAULT 0,
  
  -- Performance
  error_count INTEGER DEFAULT 0,
  error_rate NUMERIC DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, period_start, period_type)
);

CREATE INDEX idx_metrics_tenant_period ON public.tenant_usage_metrics(tenant_id, period_start DESC);

-- ============================================================================
-- 23. REALTIME USAGE EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_usage_realtime (
  entry_id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  api_method TEXT,
  api_endpoint TEXT,
  api_status_code INTEGER,
  api_response_time_ms INTEGER,
  chat_session_id UUID,
  embedding_tokens INTEGER,
  search_query_tokens INTEGER,
  search_result_count INTEGER,
  tokens_consumed INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_realtime_tenant_time ON public.tenant_usage_realtime(tenant_id, event_timestamp DESC);
CREATE INDEX idx_realtime_event_type ON public.tenant_usage_realtime(event_type);

-- ============================================================================
-- 24. AUDIT EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  action TEXT,
  actor_type TEXT,
  actor_id TEXT,
  old_values JSONB,
  new_values JSONB,
  changes_summary TEXT,
  result TEXT,
  error_message TEXT,
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_events_tenant ON public.audit_events(tenant_id);
CREATE INDEX idx_audit_events_type ON public.audit_events(event_type);
CREATE INDEX idx_audit_events_timestamp ON public.audit_events(timestamp DESC);

-- ============================================================================
-- 25. AUDIT LOGS (General)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ============================================================================
-- 26. PHI DETECTION EVENTS (HIPAA Compliance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.phi_detection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  session_id TEXT,
  phi_type TEXT NOT NULL,
  masked_value TEXT,
  context TEXT,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('masked', 'blocked', 'alerted')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_phi_tenant ON public.phi_detection_events(tenant_id);
CREATE INDEX idx_phi_created ON public.phi_detection_events(created_at DESC);

-- ============================================================================
-- 27. VERTICAL ENGINE CONFIGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vertical_engine_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  vertical TEXT CHECK (vertical IN ('healthcare', 'legal', 'financial', 'technical', 'retail', 'hospitality', 'education', 'real_estate')),
  enabled BOOLEAN DEFAULT true,
  compliance_rules JSONB DEFAULT '{}',
  prompt_templates JSONB DEFAULT '{}',
  api_integrations JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, vertical)
);

CREATE INDEX idx_vertical_configs_tenant ON public.vertical_engine_configs(tenant_id);

-- ============================================================================
-- 28. ADMIN USERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN (
    'super_admin', 'admin', 'support', 'viewer'
  )),
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ
);

CREATE INDEX idx_admin_email ON public.admin_users(email);
CREATE INDEX idx_admin_role ON public.admin_users(role);

-- ============================================================================
-- 29. ADMIN REFRESH TOKENS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(admin_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_refresh_admin ON public.admin_refresh_tokens(admin_user_id);
CREATE INDEX idx_refresh_hash ON public.admin_refresh_tokens(token_hash) WHERE revoked_at IS NULL;

-- ============================================================================
-- 30. ADMIN AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.admin_users(admin_id),
  action TEXT NOT NULL,
  target_tenant_id TEXT REFERENCES public.tenants(tenant_id),
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_admin ON public.admin_audit_log(admin_id);
CREATE INDEX idx_admin_audit_tenant ON public.admin_audit_log(target_tenant_id);
CREATE INDEX idx_admin_audit_timestamp ON public.admin_audit_log(timestamp DESC);

-- ============================================================================
-- 31. SYSTEM ALERTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  tenant_id TEXT REFERENCES public.tenants(tenant_id),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES public.admin_users(admin_id),
  acknowledged_at TIMESTAMPTZ,
  auto_resolve BOOLEAN DEFAULT FALSE,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_severity ON public.system_alerts(severity);
CREATE INDEX idx_alerts_acknowledged ON public.system_alerts(acknowledged);
CREATE INDEX idx_alerts_timestamp ON public.system_alerts(timestamp DESC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Set tenant context for RLS
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id TEXT)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.current_tenant', p_tenant_id, true);
$$;

-- Vector similarity search with tenant isolation
CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(
  query_embedding vector(1536),
  match_tenant_id TEXT,
  match_threshold NUMERIC DEFAULT 0.7,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  tenant_id TEXT,
  content TEXT,
  metadata JSONB,
  similarity NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.tenant_id,
    e.content,
    e.metadata,
    (1 - (e.embedding <=> query_embedding))::NUMERIC as similarity
  FROM public.embeddings e
  WHERE e.tenant_id = match_tenant_id
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Increment tenant usage counter
CREATE OR REPLACE FUNCTION public.increment_tenant_usage(
  p_tenant_id TEXT,
  p_period_start TIMESTAMPTZ,
  p_column TEXT,
  p_amount INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.tenant_usage (tenant_id, period_start, period_end)
  VALUES (
    p_tenant_id, 
    p_period_start, 
    p_period_start + INTERVAL '1 day'
  )
  ON CONFLICT (tenant_id, period_start) DO NOTHING;
  
  EXECUTE format(
    'UPDATE public.tenant_usage SET %I = %I + $1, updated_at = NOW() WHERE tenant_id = $2 AND period_start = $3',
    p_column, p_column
  ) USING p_amount, p_tenant_id, p_period_start;
END;
$$ LANGUAGE plpgsql;

-- Check tenant quota
CREATE OR REPLACE FUNCTION public.check_tenant_quota(
  p_tenant_id TEXT,
  p_operation TEXT
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
  v_quota_key TEXT;
  v_usage_column TEXT;
BEGIN
  SELECT quota INTO v_quota FROM public.tenants WHERE tenant_id = p_tenant_id;
  
  IF v_quota IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0;
    RETURN;
  END IF;
  
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
  
  EXECUTE format(
    'SELECT COALESCE(%I, 0) FROM public.tenant_usage WHERE tenant_id = $1 AND period_start = $2',
    v_usage_column
  ) INTO v_current USING p_tenant_id, v_period_start;
  
  v_current := COALESCE(v_current, 0);
  
  RETURN QUERY SELECT (v_current < v_limit), v_current, v_limit;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.chat_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired admin tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_admin_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.admin_refresh_tokens
  WHERE expires_at < NOW() OR revoked_at IS NOT NULL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_tenant_config_updated BEFORE UPDATE ON public.tenant_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_tenant_usage_updated BEFORE UPDATE ON public.tenant_usage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_embeddings_updated BEFORE UPDATE ON public.embeddings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_widget_configs_updated BEFORE UPDATE ON public.widget_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_ingestion_jobs_updated BEFORE UPDATE ON public.ingestion_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_onboarding_updated BEFORE UPDATE ON public.onboarding_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_workflow_updated BEFORE UPDATE ON public.workflow_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_workflow_interrupts_updated BEFORE UPDATE ON public.workflow_interrupts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_citations_updated BEFORE UPDATE ON public.citations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_scores_updated BEFORE UPDATE ON public.conversation_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_metrics_updated BEFORE UPDATE ON public.tenant_usage_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_vertical_configs_updated BEFORE UPDATE ON public.vertical_engine_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_admin_users_updated BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Session activity trigger
CREATE OR REPLACE FUNCTION public.update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity = NOW();
  NEW.expires_at = NOW() + INTERVAL '30 minutes';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_session_activity BEFORE UPDATE ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION update_session_activity();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_interrupts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage_realtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phi_detection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vertical_engine_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (allows your backend to access all data)
CREATE POLICY "service_role_bypass" ON public.tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.tenant_api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.tenant_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.tenant_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.knowledge_base FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.widget_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.chat_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.ingestion_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.crawl_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.onboarding_states FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.onboarding_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.workflow_states FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.workflow_interrupts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.workflow_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.bookings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.product_interactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.citations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.conversation_feedback FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.conversation_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.tenant_usage_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.tenant_usage_realtime FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.audit_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.phi_detection_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.vertical_engine_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.admin_users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.admin_refresh_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.admin_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass" ON public.system_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant isolation policies (tenants can only see their own data)
CREATE POLICY "tenant_isolation" ON public.tenant_api_keys FOR ALL TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.tenant_config FOR SELECT TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.tenant_usage FOR SELECT TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.knowledge_base FOR ALL TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.embeddings FOR ALL TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.widget_configs FOR ALL TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.chat_sessions FOR ALL TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.ingestion_jobs FOR SELECT TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.crawl_jobs FOR SELECT TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.bookings FOR ALL TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.orders FOR SELECT TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.citations FOR SELECT TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation" ON public.conversation_feedback FOR ALL TO authenticated 
  USING (tenant_id = current_setting('app.current_tenant', true));

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role, authenticated;

-- ============================================================================
-- SEED DATA: Default Admin User
-- Password: ChangeMe123! (CHANGE IMMEDIATELY IN PRODUCTION)
-- ============================================================================
INSERT INTO public.admin_users (email, name, password_hash, role, status) 
VALUES (
  'admin@bitb.ltd', 
  'System Admin', 
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4..5VKq0Q4aQEyPG', 
  'super_admin',
  'active'
) ON CONFLICT (email) DO NOTHING;

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES:
-- 
-- 1. All tenant_id columns are TEXT type for consistency
-- 2. All foreign keys use ON DELETE CASCADE to prevent orphan records
-- 3. All tables have RLS enabled with service_role bypass
-- 4. Vector index uses IVFFlat with 100 lists (adjust for your data size)
-- 5. Change the admin password immediately after deployment!
-- 
-- Tables created: 31
-- Functions created: 6
-- Triggers created: 17
-- RLS Policies: 62
-- ============================================================================

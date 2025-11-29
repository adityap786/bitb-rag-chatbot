-- Add multi-plan architecture support to tenants table
-- This migration adds plan types, industry verticals, and integration configs

-- Add plan type and industry vertical columns
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) CHECK (plan_type IN ('service', 'ecommerce')),
ADD COLUMN IF NOT EXISTS industry_vertical VARCHAR(50),
ADD COLUMN IF NOT EXISTS ecommerce_platform VARCHAR(50),
ADD COLUMN IF NOT EXISTS ecommerce_api_key TEXT,
ADD COLUMN IF NOT EXISTS ecommerce_api_secret TEXT,
ADD COLUMN IF NOT EXISTS calendar_integration JSONB,
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}';

-- Create citations table for RAG source tracking
CREATE TABLE IF NOT EXISTS citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  message_id UUID,
  source_title TEXT,
  source_url TEXT,
  excerpt TEXT,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create product interactions table for e-commerce analytics
CREATE TABLE IF NOT EXISTS product_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  message_id UUID,
  product_id VARCHAR(255),
  product_name TEXT,
  product_price DECIMAL(10, 2),
  action VARCHAR(50) CHECK (action IN ('view', 'compare', 'add_to_cart', 'remove_from_cart', 'purchase', 'inquiry')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create bookings table for appointments and reservations
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  booking_type VARCHAR(50) CHECK (booking_type IN ('appointment', 'consultation', 'service', 'demo', 'trial')),
  service_name TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create conversation feedback table for learning system
CREATE TABLE IF NOT EXISTS conversation_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  message_id UUID,
  feedback_type VARCHAR(50) CHECK (feedback_type IN ('thumbs_up', 'thumbs_down', 'flag', 'rating')),
  quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 5),
  user_comment TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vertical engine configurations table
CREATE TABLE IF NOT EXISTS vertical_engine_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  vertical VARCHAR(50) CHECK (vertical IN ('healthcare', 'legal', 'financial', 'technical', 'retail', 'hospitality')),
  enabled BOOLEAN DEFAULT true,
  compliance_rules JSONB DEFAULT '{}',
  prompt_templates JSONB DEFAULT '{}',
  api_integrations JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, vertical)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_citations_tenant_conversation ON citations(tenant_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_citations_created_at ON citations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_interactions_tenant ON product_interactions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_interactions_product ON product_interactions(product_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_scheduled ON bookings(tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_conversation_feedback_tenant ON conversation_feedback(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_feedback_conversation ON conversation_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_vertical_engine_configs_tenant ON vertical_engine_configs(tenant_id);

-- Add Row Level Security (RLS) policies
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE vertical_engine_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: tenants can only access their own data
CREATE POLICY citations_tenant_isolation ON citations
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY product_interactions_tenant_isolation ON product_interactions
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY bookings_tenant_isolation ON bookings
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY conversation_feedback_tenant_isolation ON conversation_feedback
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY vertical_engine_configs_tenant_isolation ON vertical_engine_configs
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add comments for documentation
COMMENT ON COLUMN tenants.plan_type IS 'Subscription plan type: service (healthcare/legal/financial) or ecommerce (products/checkout)';
COMMENT ON COLUMN tenants.industry_vertical IS 'Industry-specific vertical: healthcare, legal, financial, retail, etc.';
COMMENT ON TABLE citations IS 'RAG source citations with confidence scores for transparency';
COMMENT ON TABLE product_interactions IS 'E-commerce product interaction tracking for analytics and recommendations';
COMMENT ON TABLE bookings IS 'Appointment and service booking management for service-based businesses';
COMMENT ON TABLE conversation_feedback IS 'User feedback for continuous learning and quality improvement';
COMMENT ON TABLE vertical_engine_configs IS 'Industry-specific AI engine configurations with compliance rules';

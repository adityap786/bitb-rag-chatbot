-- ============================================================================
-- Create Test Tenant for Development
-- Run this in Supabase SQL Editor after deploying the schema
-- ============================================================================

-- Insert test tenant
INSERT INTO public.tenants (
  tenant_id,
  email,
  name,
  status,
  plan,
  plan_type,
  industry_vertical,
  llm_provider,
  llm_model
) VALUES (
  'tn_a1b2c3d4e5f6789012345678abcdef01',
  'test@bitb.dev',
  'Test Company',
  'active',
  'trial',
  'service',
  'technical',
  'groq',
  'llama-3.1-70b-instruct'
) ON CONFLICT (tenant_id) DO UPDATE SET
  updated_at = NOW();

-- Create tenant config
INSERT INTO public.tenant_config (
  tenant_id,
  batch_mode_enabled,
  max_batch_size,
  rate_limit_per_minute,
  token_quota_per_day
) VALUES (
  'tn_a1b2c3d4e5f6789012345678abcdef01',
  true,
  5,
  60,
  50000
) ON CONFLICT (tenant_id) DO UPDATE SET
  updated_at = NOW();

-- Create widget config
INSERT INTO public.widget_configs (
  tenant_id,
  display_name,
  primary_color,
  secondary_color,
  chat_tone,
  welcome_message,
  placeholder_text,
  suggested_questions
) VALUES (
  'tn_a1b2c3d4e5f6789012345678abcdef01',
  'Test AI Assistant',
  '#6366f1',
  '#8b5cf6',
  'professional',
  'Hello! I''m your test AI assistant. How can I help you today?',
  'Ask me anything...',
  ARRAY[
    'What services do you offer?',
    'How can I get started?',
    'What are your pricing plans?'
  ]::TEXT[]
) ON CONFLICT (tenant_id) DO UPDATE SET
  updated_at = NOW();

-- Initialize usage tracking for today
INSERT INTO public.tenant_usage (
  tenant_id,
  period_start,
  period_end
) VALUES (
  'tn_a1b2c3d4e5f6789012345678abcdef01',
  DATE_TRUNC('day', NOW()),
  DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
) ON CONFLICT (tenant_id, period_start) DO NOTHING;

-- Verify tenant was created
SELECT 
  tenant_id,
  email,
  name,
  status,
  plan,
  created_at
FROM public.tenants
WHERE tenant_id = 'tn_a1b2c3d4e5f6789012345678abcdef01';

-- Verify related records
SELECT 'tenant_config' as table_name, COUNT(*) as count 
FROM public.tenant_config 
WHERE tenant_id = 'tn_a1b2c3d4e5f6789012345678abcdef01'
UNION ALL
SELECT 'widget_configs', COUNT(*) 
FROM public.widget_configs 
WHERE tenant_id = 'tn_a1b2c3d4e5f6789012345678abcdef01'
UNION ALL
SELECT 'tenant_usage', COUNT(*) 
FROM public.tenant_usage 
WHERE tenant_id = 'tn_a1b2c3d4e5f6789012345678abcdef01';

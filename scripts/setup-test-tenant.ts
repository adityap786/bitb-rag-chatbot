/**
 * Test Tenant Setup Script
 * Creates a test tenant via API and verifies database records
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_TENANT_ID = 'tn_a1b2c3d4e5f6789012345678abcdef01';

async function setupTestTenant() {
  console.log('🚀 Setting up test tenant...\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Check if tenant exists
    console.log('1. Checking if test tenant exists...');
    const { data: existingTenant, error: checkError } = await supabase
      .from('tenants')
      .select('*')
      .eq('tenant_id', TEST_TENANT_ID)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existingTenant) {
      console.log('✅ Test tenant already exists:', existingTenant.email);
    } else {
      // 2. Create tenant
      console.log('2. Creating test tenant...');
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          tenant_id: TEST_TENANT_ID,
          email: 'test@bitb.dev',
          name: 'Test Company',
          status: 'active',
          plan: 'trial',
          plan_type: 'service',
          industry_vertical: 'technical',
          llm_provider: 'groq',
          llm_model: 'mixtral-8x7b-32768',
        })
        .select()
        .single();

      if (tenantError) throw tenantError;
      console.log('✅ Tenant created:', tenant.email);
    }

    // Create tenant config
    console.log('3. Creating tenant config...');
    const { error: configError } = await supabase
      .from('tenant_config')
      .upsert({
        tenant_id: TEST_TENANT_ID,
        batch_mode_enabled: true,
        max_batch_size: 5,
        rate_limit_per_minute: 60,
        token_quota_per_day: 50000,
      }, { onConflict: 'tenant_id' });

    if (configError && configError.code !== '23505') throw configError;
    console.log('✅ Tenant config created/updated');

    // 4. Create widget config
    console.log('4. Creating widget config...');
    const { error: widgetError } = await supabase
      .from('widget_configs')
      .upsert({
        tenant_id: TEST_TENANT_ID,
        display_name: 'Test AI Assistant',
        primary_color: '#6366f1',
        secondary_color: '#8b5cf6',
        chat_tone: 'professional',
        welcome_message: "Hello! I'm your test AI assistant. How can I help you today?",
        placeholder_text: 'Ask me anything...',
        suggested_questions: [
          'What services do you offer?',
          'How can I get started?',
          'What are your pricing plans?',
        ],
      }, { onConflict: 'tenant_id' });

    if (widgetError && widgetError.code !== '23505') throw widgetError;
    console.log('✅ Widget config created/updated');

    // 5. Initialize usage tracking
    console.log('5. Initializing usage tracking...');
    const periodStart = new Date();
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 1);

    const { error: usageError } = await supabase
      .from('tenant_usage')
      .upsert({
        tenant_id: TEST_TENANT_ID,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        queries_used: 0,
        api_calls: 0,
        file_uploads: 0,
        storage_used_mb: 0,
        embeddings_count: 0,
        active_sessions: 0,
      }, { onConflict: 'tenant_id,period_start' });

    if (usageError && usageError.code !== '23505') throw usageError;
    console.log('✅ Usage tracking initialized');

    // 6. Verify all records
    console.log('\n6. Verifying setup...');
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('tenant_id', TEST_TENANT_ID)
      .single();

    const { data: config } = await supabase
      .from('tenant_config')
      .select('*')
      .eq('tenant_id', TEST_TENANT_ID)
      .single();

    const { data: widget } = await supabase
      .from('widget_configs')
      .select('*')
      .eq('tenant_id', TEST_TENANT_ID)
      .single();

    const { count: usageCount } = await supabase
      .from('tenant_usage')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TEST_TENANT_ID);

    console.log('\n📊 Verification Results:');
    console.log('  - Tenant:', tenant ? '✅' : '❌');
    console.log('  - Config:', config ? '✅' : '❌');
    console.log('  - Widget:', widget ? '✅' : '❌');
    console.log('  - Usage records:', usageCount || 0);

    console.log('\n✅ Test tenant setup complete!\n');
    console.log('🔑 Test Tenant ID:', TEST_TENANT_ID);
    console.log('📧 Email:', tenant?.email);
    console.log('🏢 Name:', tenant?.name);
    console.log('📊 Status:', tenant?.status);
    console.log('💳 Plan:', tenant?.plan);

    console.log('\n💡 Next steps:');
    console.log('  1. Test ingestion: POST /api/ingest');
    console.log('  2. Test chat: POST /api/chat');
    console.log('  3. Run integration tests');

  } catch (error) {
    console.error('\n❌ Error setting up test tenant:', error);
    process.exit(1);
  }
}

export { setupTestTenant, TEST_TENANT_ID };

// Run if executed directly
setupTestTenant();

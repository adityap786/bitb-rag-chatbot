import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

/**
 * GET /api/admin/quota-usage
 * Fetch quota usage across all tenants
 */
export async function GET(req: any, context: { params: Promise<{}> }) {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // Fetch tenant usage data (mock for now - replace with actual query)
    // This would join tenant_config with usage_tracking tables
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('tenant_id, name, plan')
      .limit(limit);

    if (error) {
      console.error('Failed to fetch tenants:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Mock usage data - replace with actual tracking
    const quotaData = tenants?.map((tenant) => ({
      tenant_id: tenant.tenant_id,
      tenant_name: tenant.name || 'Unknown',
      plan: tenant.plan || 'trial',
      tokens_used: Math.floor(Math.random() * 10000),
      tokens_limit: 10000,
      queries_used: Math.floor(Math.random() * 100),
      queries_limit: 100,
      usage_percent: Math.floor(Math.random() * 100),
    })) || [];

    // Sort by usage percentage descending
    quotaData.sort((a, b) => b.usage_percent - a.usage_percent);

    return NextResponse.json({ quotas: quotaData });
  } catch (error) {
    console.error('Error in GET /api/admin/quota-usage:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

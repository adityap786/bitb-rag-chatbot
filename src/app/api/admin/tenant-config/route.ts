import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { z } from 'zod';

const supabase = createLazyServiceClient();

const TenantConfigSchema = z.object({
  tenant_id: z.string().min(1),
  batch_mode_enabled: z.boolean(),
  max_batch_size: z.number().min(1).max(10),
  rate_limit_per_minute: z.number().min(10).max(1000),
  token_quota_per_day: z.number().min(1000).max(100000),
});

/**
 * GET /api/admin/tenant-config
 * Fetch configuration for a specific tenant
 */
export async function GET(req: any, context: { params: Promise<{}> }) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenant_id');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    // Fetch from database (mock for now)
    const { data, error } = await supabase
      .from('tenant_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found"
      console.error('Failed to fetch tenant config:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Return default config if not found
    const config = data || {
      tenant_id: tenantId,
      batch_mode_enabled: true,
      max_batch_size: 5,
      rate_limit_per_minute: 60,
      token_quota_per_day: 10000,
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error in GET /api/admin/tenant-config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tenant-config
 * Update configuration for a specific tenant
 */
export async function POST(req: any, context: { params: Promise<{}> }) {
  try {
    const body = await req.json();

    // Validate request body
    const validation = TenantConfigSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const config = validation.data;

    // Upsert configuration
    const { data, error } = await supabase
      .from('tenant_config')
      .upsert(
        {
          tenant_id: config.tenant_id,
          batch_mode_enabled: config.batch_mode_enabled,
          max_batch_size: config.max_batch_size,
          rate_limit_per_minute: config.rate_limit_per_minute,
          token_quota_per_day: config.token_quota_per_day,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Failed to update tenant config:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: data,
      message: 'Configuration updated successfully',
    });
  } catch (error) {
    console.error('Error in POST /api/admin/tenant-config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

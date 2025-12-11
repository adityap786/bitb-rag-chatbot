import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { requireAdmin } from '@/lib/trial/auth';
import { AuthorizationError } from '@/lib/trial/errors';
import { z } from 'zod';

const supabase = createLazyServiceClient();

const ProvisionSchema = z.object({
  mcp_enabled: z.boolean().optional(),
  llm_enabled: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
  override_quotas: z
    .object({
      tokens_per_day: z.number().optional(),
      api_calls_per_minute: z.number().optional(),
    })
    .optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    requireAdmin(req);

    const { tenantId } = await context.params;
    const body = await req.json();
    const data = ProvisionSchema.parse(body);

    const { data: tenant, error: fetchError } = await supabase
      .from('trial_tenants')
      .select('features')
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const currentFeatures = tenant.features || {};

    const updatedFeatures = {
      ...currentFeatures,
      ...data,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('trial_tenants')
      .update({ features: updatedFeatures })
      .eq('tenant_id', tenantId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(`[AUDIT] Admin provisioned tenant ${tenantId}`, updatedFeatures);

    return NextResponse.json({
      success: true,
      tenantId,
      features: updatedFeatures,
    });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

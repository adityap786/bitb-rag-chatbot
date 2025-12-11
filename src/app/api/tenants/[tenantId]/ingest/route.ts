import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import { startTenantPipeline } from '@/lib/trial/start-pipeline';

const supabase = createLazyServiceClient();

export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const token = verifyBearerToken(req);
    const { tenantId: pathTenantId } = await context.params;

    if (token.tenantId !== pathTenantId) {
      return NextResponse.json({ error: 'Unauthorized tenant' }, { status: 403 });
    }

    const { data: tenant } = await supabase
      .from('trial_tenants')
      .select('rag_status')
      .eq('tenant_id', pathTenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Optional client overrides
    const body = await req.json().catch(() => ({}));
    const source = body?.source || 'manual';
    const metadata = body?.metadata || null;

    if (tenant.rag_status === 'processing') {
      return NextResponse.json({ error: 'Pipeline already running' }, { status: 409 });
    }

    const result = await startTenantPipeline(pathTenantId, {
      source,
      metadata,
      chunkSize: body?.chunkSize,
      chunkOverlap: body?.chunkOverlap,
      embeddingModel: body?.embeddingModel,
    });

    return NextResponse.json({ runId: result.jobId, status: result.status, source, startedAt: result.startedAt });
  } catch (error: any) {
    console.error('Tenant ingestion error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

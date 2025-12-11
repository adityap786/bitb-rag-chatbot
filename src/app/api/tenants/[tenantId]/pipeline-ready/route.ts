import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient, setTenantContext } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import { isPipelineReady } from '@/lib/trial/pipeline-readiness';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

export async function GET(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const token = verifyBearerToken(req);
    const { tenantId } = await context.params;

    if (token.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check tenant status
    const { data: tenant, error: tenantError } = await supabase
      .from('trial_tenants')
      .select('rag_status, status')
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Ensure tenant context for RLS-controlled tables
    await setTenantContext(supabase, tenantId);

    // Latest job (any status) to expose version/progress
    const { data: lastJob, error: lastJobError } = await supabase
      .from('ingestion_jobs')
      .select('job_id, status, updated_at, embeddings_count')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (lastJobError && lastJobError.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Failed to load ingestion job' }, { status: 500 });
    }

    // Vector count for readiness thresholding
    const { count: vectorCount = 0, error: vectorError } = await supabase
      .from('embeddings')
      .select('embedding_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (vectorError) {
      return NextResponse.json({ error: 'Failed to count vectors' }, { status: 500 });
    }

    const minVectors = Number(process.env.MIN_PIPELINE_VECTORS ?? '10');
    const ready = isPipelineReady({
      ragStatus: tenant.rag_status,
      lastJobStatus: lastJob?.status || null,
      vectorCount,
      minVectors,
    });

    return NextResponse.json({
      ready,
      ragStatus: tenant.rag_status,
      vectorCount,
      minVectors,
      lastIngestion: lastJob ? {
        jobId: lastJob.job_id,
        status: lastJob.status,
        completedAt: lastJob.updated_at,
        embeddingsCount: lastJob.embeddings_count ?? null,
      } : null,
    });

  } catch (error: any) {
    console.error('Pipeline readiness check failed:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}

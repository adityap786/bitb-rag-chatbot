import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import { startTenantPipeline } from '@/lib/trial/start-pipeline';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

const supabase = createLazyServiceClient();

export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const ipRateLimitResponse = await rateLimit(req, RATE_LIMITS.tenantIngestStart);
    if (ipRateLimitResponse) return ipRateLimitResponse;

    const token = verifyBearerToken(req);
    const { tenantId: pathTenantId } = await context.params;

    if (token.tenantId !== pathTenantId) {
      return NextResponse.json({ error: 'Unauthorized tenant' }, { status: 403 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('status')
      .eq('tenant_id', pathTenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Optional client overrides
    const body = await req.json().catch(() => ({}));
    const source = body?.source || 'manual';
    const metadata = body?.metadata || null;

    // Check if already processing based on ingestion job state (not tenant lifecycle status)
    const { data: existingJob } = await supabase
      .from('ingestion_jobs')
      .select('job_id, status, started_at')
      .eq('tenant_id', pathTenantId)
      .in('status', ['queued', 'processing'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJob) {
      return NextResponse.json(
        {
          status: 'processing',
          runId: existingJob.job_id,
          startedAt: existingJob.started_at ?? null,
          source,
          message: 'Pipeline already running',
        },
        { status: 409 }
      );
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

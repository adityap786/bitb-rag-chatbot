import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ tenantId: string; runId: string }> }) {
  try {
    const token = verifyBearerToken(req);
    const { tenantId, runId } = await context.params;

    if (token.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: job, error: jobError } = await supabase
      .from('ingestion_jobs')
      .select('status')
      .eq('job_id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return NextResponse.json({ status: job.status });
    }

    const { error: updateError } = await supabase
      .from('ingestion_jobs')
      .update({ status: 'cancelled', progress: 0 })
      .eq('job_id', runId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
    }

    // Mark running steps as failed for clarity
    await supabase
      .from('ingestion_job_steps')
      .update({ status: 'failed', message: 'Cancelled by user' })
      .eq('job_id', runId)
      .eq('status', 'running');

    return NextResponse.json({ status: 'cancelled' });
  } catch (error) {
    console.error('Tenant ingestion cancel error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

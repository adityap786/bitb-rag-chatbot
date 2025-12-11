import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import { INGESTION_STEP_ORDER } from '@/types/ingestion';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

export async function GET(req: NextRequest, context: { params: Promise<{ tenantId: string; runId: string }> }) {
  try {
    const token = verifyBearerToken(req);
    const { tenantId, runId } = await context.params;

    if (token.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: job, error: jobError } = await supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('job_id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const { data: steps } = await supabase
      .from('ingestion_job_steps')
      .select('*')
      .eq('job_id', runId)
      .order('created_at', { ascending: true });

    const normalizedSteps = (steps || []).map((step) => ({
      step: step.step_key,
      status: step.status,
      message: step.message,
      etaMs: step.eta_ms,
      startedAt: step.started_at,
      completedAt: step.completed_at,
    }));

    const stepProgress = INGESTION_STEP_ORDER.reduce((acc, key) => {
      const matched = normalizedSteps.find((item) => item.step === key);
      if (matched && matched.status === 'completed') {
        acc.completed += 1;
      }
      return acc;
    }, { completed: 0 });

    return NextResponse.json({
      runId,
      status: job.status,
      progress: job.progress,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      steps: normalizedSteps,
      completedSteps: stepProgress.completed,
    });
  } catch (error) {
    console.error('Tenant ingestion status error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

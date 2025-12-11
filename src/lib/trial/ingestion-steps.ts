import { createLazyServiceClient } from '@/lib/supabase-client';
import type { IngestionStepKey } from '@/types/ingestion';

const supabase = createLazyServiceClient();

type StepMessage = string | null;

interface StepOptions {
  etaMs?: number;
  message?: StepMessage;
}

function timestamp() {
  return new Date().toISOString();
}

async function upsertStepRecord(jobId: string, stepKey: IngestionStepKey, payload: Record<string, any>) {
  await supabase
    .from('ingestion_job_steps')
    .upsert({ 
      job_id: jobId, 
      step_key: stepKey, 
      updated_at: timestamp(),  // Always update for SSE change detection
      ...payload 
    }, { onConflict: 'job_id,step_key' });
}

export async function recordStepStart(jobId: string, stepKey: IngestionStepKey, options?: StepOptions) {
  if (!jobId) return;
  await upsertStepRecord(jobId, stepKey, {
    status: 'running',
    eta_ms: options?.etaMs ?? null,
    message: options?.message ?? null,
    started_at: timestamp(),
  });
}

export async function recordStepComplete(jobId: string, stepKey: IngestionStepKey, options?: StepOptions) {
  if (!jobId) return;
  await upsertStepRecord(jobId, stepKey, {
    status: 'completed',
    completed_at: timestamp(),
    message: options?.message ?? null,
  });
}

export async function recordStepFailure(jobId: string, stepKey: IngestionStepKey, errorMessage?: string) {
  if (!jobId) return;
  await upsertStepRecord(jobId, stepKey, {
    status: 'failed',
    completed_at: timestamp(),
    message: errorMessage ?? 'Step failed',
  });
}

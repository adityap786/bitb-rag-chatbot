import { createLazyServiceClient } from '@/lib/supabase-client';
import { buildRAGPipeline } from './rag-pipeline';
import { validateTenantId } from '../security/rag-guardrails';

const supabase = createLazyServiceClient();

export type StartPipelineOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
  embeddingModel?: string;
  source?: string;
  metadata?: Record<string, any>;
  skipIfProcessing?: boolean;
};

export async function startTenantPipeline(tenantId: string, options: StartPipelineOptions = {}) {
  validateTenantId(tenantId);

  const { data: tenant, error: tenantError } = await supabase
    .from('trial_tenants')
    .select('rag_status')
    .eq('tenant_id', tenantId)
    .single();

  if (tenantError || !tenant) {
    throw new Error('Tenant not found');
  }

  if (tenant.rag_status === 'processing' && options.skipIfProcessing) {
    return { status: 'processing', jobId: null } as const;
  }

  const { data: job, error: jobError } = await supabase
    .from('ingestion_jobs')
    .insert({
      tenant_id: tenantId,
      data_source: options.source || 'manual',
      status: 'queued',
      progress: 0,
      metadata: options.metadata || null,
      started_at: new Date().toISOString(),
    })
    .select('job_id, started_at')
    .single();

  if (jobError || !job) {
    throw new Error(jobError?.message || 'Failed to create ingestion job');
  }

  const config = {
    tenantId,
    chunkSize: options.chunkSize ?? 1024,
    chunkOverlap: options.chunkOverlap ?? 100,
    embeddingModel: options.embeddingModel ?? 'all-mpnet-base-v2',
  } as const;

  void buildRAGPipeline(tenantId, config, job.job_id).catch((err) => {
    console.error('[startTenantPipeline] build pipeline failed', err);
  });

  return { status: 'processing', jobId: job.job_id, startedAt: job.started_at } as const;
}

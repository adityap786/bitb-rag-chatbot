import { createLazyServiceClient } from '@/lib/supabase-client';
import { buildRAGPipeline } from './rag-pipeline';
import { validateTenantId } from '../security/rag-guardrails';
import { enqueueTenantPipelineJob } from '@/lib/queues/tenantPipelineQueue';

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
    .from('tenants')
    .select('status')
    .eq('tenant_id', tenantId)
    .single();

  if (tenantError || !tenant) {
    throw new Error('Tenant not found');
  }

  // Treat an in-progress job as processing to avoid duplicate work.
  // NOTE: Do not rely on tenants.status for pipeline state; that column is tenant lifecycle.
  if (options.skipIfProcessing) {
    const { data: existingJob } = await supabase
      .from('ingestion_jobs')
      .select('job_id, status, started_at')
      .eq('tenant_id', tenantId)
      .in('status', ['queued', 'processing'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJob) {
      return {
        status: 'processing',
        jobId: existingJob.job_id,
        startedAt: existingJob.started_at ?? null,
      } as const;
    }
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

  // Prefer dedicated worker execution when Redis is available (BullMQ).
  // This avoids running heavy ingestion inside the Next.js request lifecycle.
  const hasBullmqRedis = Boolean(process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL);
  if (hasBullmqRedis) {
    await enqueueTenantPipelineJob({ tenantId, jobId: job.job_id, config });
  } else {
    // In production, do not run heavy ingestion work inside the Next.js request lifecycle.
    if (process.env.NODE_ENV === 'production') {
      await supabase
        .from('ingestion_jobs')
        .update({
          status: 'failed',
          error_message: 'Missing REDIS_URL/BULLMQ_REDIS_URL for BullMQ tenant pipeline worker',
        })
        .eq('job_id', job.job_id);

      throw new Error('Missing REDIS_URL/BULLMQ_REDIS_URL for BullMQ tenant pipeline worker');
    }

    // Dev fallback: run in-process if no BullMQ Redis is configured.
    void buildRAGPipeline(tenantId, config, job.job_id).catch((err) => {
      console.error('[startTenantPipeline] build pipeline failed', {
        tenantId,
        jobId: job.job_id,
        error: err.message,
        stack: err.stack,
      });
    });
  }

  return { status: 'processing', jobId: job.job_id, startedAt: job.started_at } as const;
}

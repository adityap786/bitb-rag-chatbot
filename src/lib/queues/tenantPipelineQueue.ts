// Ensure .env.local variables are loaded before any BullMQ connection is created.
// Next.js loads env automatically, but standalone worker processes do not.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import { Queue, Worker, QueueScheduler, Job } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { logger } from '../observability/logger';
import { buildRAGPipeline } from '../trial/rag-pipeline';
import type { RAGPipelineConfig } from '../../types/trial';

export type TenantPipelineJobData = {
  tenantId: string;
  jobId: string;
  config: RAGPipelineConfig;
};


// DEBUG: Print env vars to diagnose connection issues
console.log('[DEBUG] BULLMQ_REDIS_URL:', process.env.BULLMQ_REDIS_URL);
console.log('[DEBUG] REDIS_URL:', process.env.REDIS_URL);

const QUEUE_NAME = 'tenant_pipeline';
const JOB_NAME = 'build_pipeline';

// BullMQ requires Redis protocol. We only create Queue/Scheduler/Worker lazily
// so module evaluation during `next build` does not attempt any Redis connections.
function resolveBullmqConnection(): any {
  const bullUrl = process.env.BULLMQ_REDIS_URL;
  const redisEnvUrl = process.env.REDIS_URL;

  const urlToUse = bullUrl || redisEnvUrl;

  if (urlToUse) {
    console.log('[DEBUG] resolveBullmqConnection: using', bullUrl ? 'BULLMQ_REDIS_URL' : 'REDIS_URL');

    if (!urlToUse.startsWith('redis://') && !urlToUse.startsWith('rediss://')) {
      throw new Error(
        `Invalid BullMQ Redis URL scheme. Expected redis:// or rediss://, got: ${urlToUse.split(':')[0]}://...`
      );
    }

    // Parse the URL to extract components for ioredis
    try {
      const parsedUrl = new URL(urlToUse);
      const useTls = parsedUrl.protocol === 'rediss:';
      const password = parsedUrl.password || decodeURIComponent(parsedUrl.username === 'default' ? parsedUrl.password : parsedUrl.username);

      return {
        host: parsedUrl.hostname,
        port: parseInt(parsedUrl.port, 10) || 6379,
        password: password,
        tls: useTls ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false,
      };
    } catch (parseError) {
      console.error('[DEBUG] Failed to parse Redis URL, falling back to url option:', parseError);
      return { url: urlToUse };
    }
  }

  // In dev, BullMQ defaults to localhost:6379 if no connection is provided.
  // In production, avoid silently defaulting to localhost.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing REDIS_URL/BULLMQ_REDIS_URL for BullMQ tenant pipeline queue in production');
  }

  return undefined;
}


let queueOptions: any = undefined;
let tenantPipelineQueue: Queue<TenantPipelineJobData> | null = null;
let tenantPipelineScheduler: QueueScheduler | null = null;
let tenantPipelineWorker: Worker<TenantPipelineJobData> | null = null;

function ensureQueue(): void {
  if (!queueOptions) {
    queueOptions = {
      connection: resolveBullmqConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { age: 60 * 60 },
        removeOnFail: { age: 24 * 60 * 60 },
      },
    };
  }
  if (!tenantPipelineQueue) tenantPipelineQueue = new Queue<TenantPipelineJobData>(QUEUE_NAME, queueOptions);
}

function ensureWorkerSystem(): void {
  ensureQueue();

  // QueueScheduler should run in a long-lived process (the worker), not inside
  // a short-lived web/request process.
  if (!tenantPipelineScheduler) tenantPipelineScheduler = new QueueScheduler(QUEUE_NAME, queueOptions);
}

export function isTenantPipelineQueueEnabled(): boolean {
  // In prod we expect Redis to be configured for BullMQ.
  const hasRedisUrl = Boolean(process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL);
  return hasRedisUrl || process.env.NODE_ENV !== 'production';
}

export async function enqueueTenantPipelineJob(
  data: TenantPipelineJobData,
  options?: JobsOptions
) {
  ensureQueue();
  const jobId = data.jobId;
  return tenantPipelineQueue!.add(JOB_NAME, data, {
    jobId,
    ...options,
  });
}

export function startTenantPipelineWorker(params?: { concurrency?: number }) {
  ensureWorkerSystem();

  if (tenantPipelineWorker) return tenantPipelineWorker;

  const concurrency = Math.max(1, Number(params?.concurrency ?? process.env.TENANT_PIPELINE_WORKER_CONCURRENCY ?? 2));

  tenantPipelineWorker = new Worker<TenantPipelineJobData>(
    QUEUE_NAME,
    async (job: Job<TenantPipelineJobData>) => {
      const { tenantId, jobId, config } = job.data;
      logger.info('Tenant pipeline job started', { tenantId, jobId });
      await buildRAGPipeline(tenantId, config, jobId);
      logger.info('Tenant pipeline job completed', { tenantId, jobId });
      return { ok: true };
    },
    {
      connection: resolveBullmqConnection(),
      concurrency,
    }
  );

  tenantPipelineWorker.on('failed', (job, err) => {
    logger.error('Tenant pipeline job failed', {
      jobId: job?.data?.jobId ?? job?.id,
      tenantId: job?.data?.tenantId,
      error: err?.message ?? String(err),
    });
  });

  tenantPipelineWorker.on('completed', (job) => {
    logger.info('Tenant pipeline job completed', {
      jobId: job?.data?.jobId ?? job?.id,
      tenantId: job?.data?.tenantId,
    });
  });

  return tenantPipelineWorker;
}

export async function shutdownTenantPipelineQueue(): Promise<void> {
  try {
    if (tenantPipelineWorker) {
      await tenantPipelineWorker.close();
      tenantPipelineWorker = null;
    }
    if (tenantPipelineScheduler) {
      await tenantPipelineScheduler.close();
      tenantPipelineScheduler = null;
    }
    if (tenantPipelineQueue) {
      await tenantPipelineQueue.close();
      tenantPipelineQueue = null;
    }
  } catch (error) {
    logger.error('Failed to shutdown tenant pipeline queue', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

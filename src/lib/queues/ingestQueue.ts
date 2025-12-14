import { Queue, Worker, QueueScheduler, Job } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { createLazyServiceClient } from '../supabase-client';
import { logger } from '../observability/logger';
import { recordQueueJobMetrics, recordIngestionJobMetrics } from '../monitoring/metrics';
import { createIngestionTrace } from '../observability/langfuse-client';

type IngestionDataSource = {
  type: 'manual' | 'upload' | 'crawl';
  urls?: string[];
  crawl_depth?: number;
  files?: string[];
  text?: string;
  [key: string]: unknown;
};

export interface IngestionJobPayload {
  job_id: string;
  tenant_id: string;
  trial_token: string;
  data_source: IngestionDataSource;
  priority?: 'high' | 'normal';
}

/**
 * Validate ingestion job payload
 */
function validateJobPayload(payload: IngestionJobPayload): void {
  if (!payload.job_id || typeof payload.job_id !== 'string') {
    throw new Error('Invalid job_id');
  }
  if (!payload.tenant_id || typeof payload.tenant_id !== 'string') {
    throw new Error('Invalid tenant_id');
  }
  if (!payload.trial_token || typeof payload.trial_token !== 'string') {
    throw new Error('Invalid trial_token');
  }
  if (!payload.data_source || typeof payload.data_source !== 'object') {
    throw new Error('Invalid data_source');
  }
  if (!['manual', 'upload', 'crawl'].includes(payload.data_source.type)) {
    throw new Error('Invalid data_source.type');
  }
}

// BullMQ requires Redis protocol. We only create Queue/Scheduler/Worker lazily
// so module evaluation during `next build` does not attempt any Redis connections.
function resolveBullmqConnection(): any {
  const bullUrl = process.env.BULLMQ_REDIS_URL;
  const redisEnvUrl = process.env.REDIS_URL;

  const urlToUse = bullUrl || redisEnvUrl;

  if (urlToUse) {
    console.log('[DEBUG] ingestQueue resolveBullmqConnection: using', bullUrl ? 'BULLMQ_REDIS_URL' : 'REDIS_URL');
    if (!urlToUse.startsWith('redis://') && !urlToUse.startsWith('rediss://')) {
      throw new Error(`Invalid BullMQ Redis URL scheme. Expected redis:// or rediss://, got: ${urlToUse.split(':')[0]}://...`);
    }

    // Parse the URL to extract components for ioredis (required for TLS/Upstash)
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
    throw new Error('Missing REDIS_URL/BULLMQ_REDIS_URL for BullMQ ingest queue in production');
  }

  return undefined;
}


let redisConnection: any = undefined;
let queueOptions: any = undefined;
let ingestQueue: Queue<IngestionJobPayload> | null = null;
let ingestScheduler: QueueScheduler | null = null;
let ingestionWorker: Worker<IngestionJobPayload> | null = null;

function ensureQueueSystem(): void {
  if (!queueOptions) {
    redisConnection = resolveBullmqConnection();
    queueOptions = {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { age: 60 * 60 },
        removeOnFail: { age: 24 * 60 * 60 },
      },
    };
  }
  if (!ingestQueue) ingestQueue = new Queue<IngestionJobPayload>('ingest', queueOptions);
  if (!ingestScheduler) ingestScheduler = new QueueScheduler('ingest', queueOptions);
}

const supabase = createLazyServiceClient();

async function updateJobStatus(jobId: string, updates: Record<string, unknown>) {
  const { error } = await supabase
    .from('ingestion_jobs')
    .update(updates)
    .eq('job_id', jobId);

  if (error) {
    logger.warn('Failed to update ingestion job status', {
      jobId,
      error: error.message,
    });
  }
}

async function processIngestJob(job: Job<IngestionJobPayload>) {
  const startTime = Date.now();
  const { job_id, tenant_id, trial_token, data_source } = job.data;

  // Create Langfuse trace
  const trace = createIngestionTrace(job_id, tenant_id, data_source);

  // Record queue metrics
  recordQueueJobMetrics('ingest', 'processing');
  recordIngestionJobMetrics('started');

  await updateJobStatus(job.data.job_id, {
    status: 'processing',
    progress: 10,
    started_at: new Date().toISOString(),
  });

  try {
    // Invoke Python ingestion worker
    const { spawn } = await import('child_process');
    const pythonPath =
      process.env.PYTHON_EXECUTABLE ||
      (process.platform === 'win32'
        ? ['p', 'y', 't', 'h', 'o', 'n'].join('')
        : ['p', 'y', 't', 'h', 'o', 'n', '3'].join(''));
    const workerScript = process.env.INGEST_WORKER_PATH || './python/ingest_worker.py';

    const args: string[] = [
      workerScript,
      '--job-id', job_id,
      '--tenant-id', tenant_id,
      '--token', trial_token,
    ];

    // Add data source specific args
    if (data_source.type === 'crawl' && data_source.urls) {
      args.push('--url', data_source.urls[0]);
      args.push('--depth', String(data_source.crawl_depth || 2));
    } else if (data_source.type === 'upload' && data_source.files) {
      args.push('--files', ...data_source.files);
    } else if (data_source.type === 'manual' && data_source.text) {
      args.push('--text', data_source.text);
    }

    const workerStdout = await new Promise<string>((resolve, reject) => {
      const worker = spawn(pythonPath, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB limit to prevent memory issues

      worker.stdout?.on('data', (data) => {
        const chunk = data.toString();

        // Prevent memory overflow from stdout accumulation
        if (stdout.length < MAX_BUFFER_SIZE) {
          stdout += chunk;
        }

        // Parse progress updates from worker (real-time, don't accumulate)
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.includes('PROGRESS:')) {
            const match = line.match(/PROGRESS:\s*(\d+)/);
            if (match) {
              const progress = parseInt(match[1], 10);
              if (progress >= 0 && progress <= 100) {
                updateJobStatus(job_id, { progress }).catch((err) => {
                  logger.warn('Failed to update progress', { job_id, error: err });
                });
              }
            }
          }
        }
      });

      worker.stderr?.on('data', (data) => {
        const chunk = data.toString();

        // Prevent memory overflow
        if (stderr.length < MAX_BUFFER_SIZE) {
          stderr += chunk;
        }

        // Log stderr in real-time but limit logged data
        const logChunk = chunk.length > 500 ? chunk.substring(0, 500) + '...' : chunk;
        logger.warn('Ingestion worker stderr', { job_id, stderr: logChunk });
      });

      worker.on('close', (code) => {
        if (code === 0) {
          logger.info('Ingestion worker completed', { job_id, tenant_id });
          resolve(stdout);
        } else {
          const errorMsg = stderr.substring(0, 1000); // Limit error message size
          logger.error('Ingestion worker failed', { job_id, code, stderr: errorMsg });
          reject(new Error(`Worker exited with code ${code}: ${errorMsg}`));
        }
      });

      worker.on('error', (error) => {
        logger.error('Failed to spawn ingestion worker', { job_id, error: error.message });
        reject(error);
      });

      // Timeout protection (5 minutes max for worker)
      const timeout = setTimeout(() => {
        worker.kill('SIGTERM');
        reject(new Error('Ingestion worker timeout after 5 minutes'));
      }, 300_000);

      worker.on('close', () => clearTimeout(timeout));
    });

    // Try to parse worker stdout for details (pages_processed, chunks_created, index_path)
    try {
      let parsedResult: any = null;
      if (workerStdout) {
        try {
          parsedResult = JSON.parse(workerStdout);
        } catch (e) {
          // If stdout contains logs + JSON, attempt extracting the last JSON object
          const lastBrace = workerStdout.lastIndexOf('{');
          if (lastBrace !== -1) {
            const maybeJson = workerStdout.slice(lastBrace);
            try {
              parsedResult = JSON.parse(maybeJson);
            } catch (err) {
              parsedResult = null;
            }
          }
        }
      }

      const updates: Record<string, unknown> = {
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
      };

      if (parsedResult) {
        if (parsedResult.pages_crawled !== undefined) updates.pages_processed = parsedResult.pages_crawled;
        if (parsedResult.pages_processed !== undefined) updates.pages_processed = parsedResult.pages_processed;
        if (parsedResult.chunks_created !== undefined) updates.chunks_created = parsedResult.chunks_created;
        if (parsedResult.chunks !== undefined) updates.chunks_created = parsedResult.chunks.length || parsedResult.chunks;
        if (parsedResult.index_path) updates.index_path = parsedResult.index_path;
      }

      await updateJobStatus(job_id, updates);
    } catch (err) {
      logger.warn('Failed to parse worker stdout or update job with details', { job_id, error: err instanceof Error ? err.message : String(err) });
      // Fallback: mark completed without extra metadata
      await updateJobStatus(job_id, {
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
      });
    }

    // Record completion metrics
    const duration = Date.now() - startTime;
    recordQueueJobMetrics('ingest', 'completed', duration);
    recordIngestionJobMetrics('completed');

    // Update trace
    if (trace) {
      try {
        trace.update({
          output: { success: true, duration_ms: duration },
          metadata: { status: 'completed' },
        });
      } catch (traceError) {
        logger.debug('Failed to update Langfuse trace', {
          job_id,
          error: traceError instanceof Error ? traceError.message : String(traceError),
        });
      }
    }

    logger.info('Ingestion job completed', { job_id, tenant_id, duration_ms: duration });
    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    recordQueueJobMetrics('ingest', 'failed', duration);
    recordIngestionJobMetrics('failed');

    // Update trace with error
    if (trace) {
      try {
        trace.update({
          output: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          metadata: { status: 'failed' },
        });
      } catch (traceError) {
        logger.debug('Failed to update Langfuse trace', {
          job_id,
          error: traceError instanceof Error ? traceError.message : String(traceError),
        });
      }
    }

    logger.error('Ingestion job failed', {
      job_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function ensureIngestionWorker(): Worker<IngestionJobPayload> {
  if (ingestionWorker) return ingestionWorker;
  ensureQueueSystem();

  ingestionWorker = new Worker<IngestionJobPayload>(
    'ingest',
    processIngestJob,
    {
      ...queueOptions,
      concurrency: 2,
      lockDuration: 300_000,
    }
  );

  ingestionWorker.on('failed', async (job: Job<IngestionJobPayload> | undefined, err: Error | unknown) => {
    if (!job) return;
    await updateJobStatus(job.data.job_id, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    });
  });

  ingestionWorker.on('completed', async (job: Job<IngestionJobPayload>) => {
    await updateJobStatus(job.data.job_id, {
      completed_at: new Date().toISOString(),
    });
  });

  return ingestionWorker;
}

export async function queueIngestionJob(
  payload: IngestionJobPayload,
  options?: JobsOptions
) {
  // Validate payload before queueing
  validateJobPayload(payload);

  ensureQueueSystem();

  try {
    const job = await ingestQueue!.add(payload.job_id, payload, {
      priority: payload.priority === 'high' ? 1 : 5,
      delay: 1000,
      ...options,
    });

    logger.info('Ingestion job queued', {
      job_id: payload.job_id,
      tenant_id: payload.tenant_id,
      queue_job_id: job.id,
    });

    return job;
  } catch (error) {
    logger.error('Failed to queue ingestion job', {
      job_id: payload.job_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function getIngestionWorker() {
  return ensureIngestionWorker();
}

export function getIngestionQueue() {
  ensureQueueSystem();
  return ingestQueue!;
}

export function getIngestionSchedulerInstance() {
  ensureQueueSystem();
  return ingestScheduler!;
}

/**
 * Health check for queue system
 */
export async function checkQueueHealth(): Promise<{
  healthy: boolean;
  redis: boolean;
  queue: boolean;
  worker: boolean;
  details?: Record<string, unknown>;
}> {
  try {
    // Do not create the worker as a side-effect of a health check.
    ensureQueueSystem();

    // Check Redis connection (may be undefined in serverless/dev)
    const redisStatus = (redisConnection as any)?.status ?? 'unavailable';
    const redisHealthy = Boolean(redisConnection) && (redisStatus === 'ready' || redisStatus === 'connect');

    // Check queue status
    const queueCounts = await ingestQueue!.getJobCounts();

    // Check worker status
    const workerRunning = Boolean(ingestionWorker) && ingestionWorker.isRunning();

    const healthy = redisHealthy && workerRunning;

    return {
      healthy,
      redis: redisHealthy,
      queue: true,
      worker: workerRunning,
      details: {
        redis_status: redisStatus,
        queue_counts: queueCounts,
        worker_concurrency: 2,
      },
    };
  } catch (error) {
    logger.error('Queue health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      healthy: false,
      redis: false,
      queue: false,
      worker: false,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Graceful shutdown - close all connections and workers
 */
export async function shutdownQueue(): Promise<void> {
  logger.info('Shutting down ingestion queue system...');

  try {
    // Close worker (wait for active jobs)
    if (ingestionWorker) {
      await ingestionWorker.close();
      logger.info('Worker closed');
    }

    // Close scheduler
    if (ingestScheduler) {
      await ingestScheduler.close();
      logger.info('Scheduler closed');
    }

    // Close queue
    if (ingestQueue) {
      await ingestQueue.close();
      logger.info('Queue closed');
    }

    // Disconnect Redis if present
    if (redisConnection && typeof (redisConnection as any).quit === 'function') {
      await (redisConnection as any).quit();
      logger.info('Redis disconnected');
    }

    logger.info('Queue system shutdown complete');
  } catch (error) {
    logger.error('Error during queue shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
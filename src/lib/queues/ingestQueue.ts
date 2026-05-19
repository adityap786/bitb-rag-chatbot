// BullMQ v5: QueueScheduler is no longer needed - delayed jobs are handled automatically
import { Queue, Worker, Job } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { createLazyServiceClient } from '../supabase-client';
import { logger } from '../observability/logger';
import { recordQueueJobMetrics, recordIngestionJobMetrics } from '../monitoring/metrics';
import { createIngestionTrace } from '../observability/langfuse-client';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

type IngestionDataSource = {
  type: 'manual' | 'upload' | 'crawl';
  urls?: string[];
  crawl_depth?: number;
  files?: string[];
  text?: string;
  [key: string]: unknown;
};

/**
 * Syncs the output from the Python ingestion worker (local JSON) to the Supabase database.
 * This bridges the gap between the Python worker (FAISS/Disk) and the RAG app (Supabase).
 */
async function syncPythonOutputToSupabase(
  tenantId: string,
  trialToken: string,
  dataSource: IngestionDataSource
) {
  const metadataPath = path.join(process.cwd(), 'data', 'faiss_indices', `${trialToken}.metadata.json`);

  try {
    await fs.access(metadataPath);
  } catch {
    logger.warn('No metadata file found from Python worker, skipping sync', { tenantId, trialToken, path: metadataPath });
    return;
  }

  const content = await fs.readFile(metadataPath, 'utf-8');
  let chunks: any[];
  try {
    chunks = JSON.parse(content);
  } catch (e) {
    throw new Error(`Failed to parse metadata JSON: ${(e as Error).message}`);
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    logger.info('No chunks to sync', { tenantId });
    return;
  }

  logger.info('Syncing Python output to Supabase', { tenantId, chunkCount: chunks.length });

  // Group chunks by specific source (URL or File)
  const grouped = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    const key = chunk.source_url || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(chunk);
  }

  for (const [sourceUrl, sourceChunks] of grouped.entries()) {
    // 1. Create Knowledge Base Entry
    // Approximate raw_text by joining chunks (not perfect, but better than empty)
    const rawText = sourceChunks.map((c: any) => c.text).join('\n\n');
    const contentHash = createHash('sha256').update(`${tenantId}|${rawText}`).digest('hex');

    // Check existing
    const { data: existingKb } = await supabase
      .from('knowledge_base')
      .select('kb_id')
      .eq('tenant_id', tenantId)
      .eq('content_hash', contentHash)
      .maybeSingle();

    let kbId = existingKb?.kb_id;

    if (!kbId) {
      const { data: newKb, error: kbError } = await supabase
        .from('knowledge_base')
        .insert({
          tenant_id: tenantId,
          source_type: dataSource.type,
          content_hash: contentHash,
          raw_text: rawText,
          metadata: {
            source: sourceUrl,
            title: sourceChunks[0]?.metadata?.title || sourceUrl,
            chunkCount: sourceChunks.length,
            syncedFromPython: true,
          },
          processed_at: new Date().toISOString(),
        })
        .select('kb_id')
        .single();

      if (kbError) throw new Error(`Failed to create KB entry: ${kbError.message}`);
      kbId = newKb.kb_id;
    } else {
      // KB exists. To ensure idempotency (and fix potential partial failures from previous runs),
      // we clear existing embeddings for this KB before inserting the new batch.
      // This guarantees we don't duplicate vectors for the same content.
      const { error: deleteError } = await supabase
        .from('embeddings')
        .delete()
        .eq('kb_id', kbId);

      if (deleteError) {
        logger.warn('Failed to clear existing embeddings during sync', { tenantId, kbId, error: deleteError.message });
        // Proceeding might be risky (duplicates), but we'll try to insert anyway or throw?
        // Throwing is safer for consistency.
        throw new Error(`Failed to clear existing embeddings: ${deleteError.message}`);
      }
    }

    // 2. Insert Embeddings
    // Prepare records
    const records = sourceChunks.map((chunk: any) => {
      // Extract vector
      const meta = chunk.metadata || {};
      const embedding = meta.embedding_768 || meta.embedding_384;

      // Remove vector from metadata to save space
      const cleanMetadata = { ...meta };
      delete cleanMetadata.embedding_768;
      delete cleanMetadata.embedding_384;

      if (!embedding) {
        // Skip chunks without embeddings (shouldn't happen if worker worked)
        return null;
      }

      return {
        kb_id: kbId,
        tenant_id: tenantId,
        content: chunk.text,
        embedding_768: embedding, // We assume 768 for now as per our previous fix
        metadata: cleanMetadata,
      };
    }).filter(Boolean);

    if (records.length > 0) {
      // Insert in batches if needed, but for now single batch
      const { error: embedError } = await supabase
        .from('embeddings')
        .insert(records as any[]); // Cast to any to avoid strict type checks on dynamic shapes

      if (embedError) throw new Error(`Failed to insert embeddings: ${embedError.message}`);
    }
  }
}


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
  // BullMQ v5: QueueScheduler is no longer needed
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

      worker.on('close', async (code) => {
        if (code === 0) {
          try {
            // SYNC: Read Python output and sync to Supabase (KB + Embeddings)
            await syncPythonOutputToSupabase(tenant_id, trial_token, data_source);
          } catch (syncErr) {
            logger.error('Failed to sync Python ingestion output to Supabase', { job_id, error: syncErr instanceof Error ? syncErr.message : String(syncErr) });
            // We don't fail the whole job? Or should we? 
            // If we don't sync, the user sees nothing. We should probably fail or at least mark partial success.
            // For now, let's treat it as a failure for the job so it can be retried or investigated.
            reject(new Error(`Worker finished but sync failed: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`));
            return;
          }

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

// BullMQ v5: QueueScheduler is deprecated and no longer needed
// export function getIngestionSchedulerInstance() - REMOVED

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
    const workerRunning = ingestionWorker ? ingestionWorker.isRunning() : false;

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

    // BullMQ v5: QueueScheduler is no longer needed

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

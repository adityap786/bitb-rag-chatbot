
// Ensure .env variables (like REDIS_URL) are loaded before any connection is created
import dotenv from 'dotenv';
dotenv.config();

import { Queue, Worker, QueueScheduler, Job } from 'bullmq';
import { upstashRedis } from './redis-client-upstash';

// BullMQ requires Redis protocol, not Upstash REST. If you need serverless queues, use Upstash QStash or a cloud queue. For now, we document this limitation.
function resolveBullmqConnection(): any {
  const bullUrl = process.env.BULLMQ_REDIS_URL;
  const redisEnvUrl = process.env.REDIS_URL;

  if (bullUrl) {
    console.log('[DEBUG] ingestion-queue resolveBullmqConnection: using BULLMQ_REDIS_URL');
    if (!bullUrl.startsWith('redis://') && !bullUrl.startsWith('rediss://')) {
      throw new Error(`Invalid BullMQ Redis URL scheme. Expected redis:// or rediss://, got: ${bullUrl.split(':')[0]}://...`);
    }
    return { url: bullUrl };
  }

  if (redisEnvUrl) {
    console.log('[DEBUG] ingestion-queue resolveBullmqConnection: using REDIS_URL');
    if (!redisEnvUrl.startsWith('redis://') && !redisEnvUrl.startsWith('rediss://')) {
      throw new Error(`Invalid BullMQ Redis URL scheme. Expected redis:// or rediss://, got: ${redisEnvUrl.split(':')[0]}://...`);
    }
    return { url: redisEnvUrl };
  }

  // In dev, BullMQ defaults to localhost:6379 if no connection is provided.
  // We intentionally keep initialization lazy so `next build` does not attempt
  // any Redis connections.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing REDIS_URL/BULLMQ_REDIS_URL for BullMQ ingestion queue in production');
  }
  return undefined;
}

// Job schema for ingestion
export interface IngestionJobData {
  tenant_id: string;
  doc_id: string;
  source: 'upload' | 'crawl';
  payload: any;
  metadata?: Record<string, any>;
}

let _ingestionQueue: Queue<IngestionJobData> | null = null;
let _ingestionScheduler: QueueScheduler | null = null;

export function getIngestionQueue() {
  if (!_ingestionQueue) {
    _ingestionQueue = new Queue<IngestionJobData>('ingestion', {
      connection: resolveBullmqConnection(),
    });
  }
  return _ingestionQueue;
}

export function getIngestionQueueScheduler() {
  if (!_ingestionScheduler) {
    _ingestionScheduler = new QueueScheduler('ingestion', { connection: resolveBullmqConnection() });
  }
  return _ingestionScheduler;
}

// Enqueue a new ingestion job
export async function enqueueIngestionJob(job: IngestionJobData) {
  return getIngestionQueue().add('ingest', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

// Worker process (to be run in a separate process/service)
export function startIngestionWorker(processJob: (job: Job<IngestionJobData>) => Promise<any>) {
  // Ensure scheduler exists for delayed/backoff jobs.
  try {
    getIngestionQueueScheduler();
  } catch {
    // If scheduler can't start (e.g. missing Redis in prod), worker start will fail anyway.
  }

  const worker = new Worker<IngestionJobData>(
    'ingestion',
    async (job) => {
      try {
        return await processJob(job);
      } catch (err) {
        // Optionally log or handle error
        throw err;
      }
    },
    { connection: resolveBullmqConnection() }
  );
  worker.on('completed', (job) => {
    console.log(`[IngestionWorker] Job completed: ${job.id}`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[IngestionWorker] Job failed: ${job?.id}`, err);
  });
  return worker;
}

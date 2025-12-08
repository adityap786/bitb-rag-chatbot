import { Queue, Worker, QueueScheduler, Job } from 'bullmq';
import { upstashRedis } from '../redis-client-upstash';

// BullMQ requires a Redis connection string, Upstash supports standard Redis protocol for BullMQ >= v1.91
const connection = {
  host: process.env.UPSTASH_REDIS_REST_URL?.replace('https://', ''),
  port: 6379, // Upstash supports TLS on 6379
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  tls: {},
};

export const onboardingQueue = new Queue('onboarding', { connection });
export const onboardingQueueScheduler = new QueueScheduler('onboarding', { connection });

// Example job processor (to be run in a worker process)
export const onboardingWorker = new Worker(
  'onboarding',
  async (job: Job) => {
    // Simulate onboarding step execution
    if (job.data.type === 'catalog_ingestion') {
      // ...call catalog ingestion logic
      return { status: 'catalog_ingested', jobId: job.id };
    }
    if (job.data.type === 'update_settings') {
      // ...call theme setup logic
      return { status: 'theme_updated', jobId: job.id };
    }
    return { status: 'unknown', jobId: job.id };
  },
  { connection }
);

// Usage:
// await onboardingQueue.add('catalog_ingestion', { type: 'catalog_ingestion', tenantId: 'tn_...' });
// await onboardingQueue.add('update_settings', { type: 'update_settings', tenantId: 'tn_...' });

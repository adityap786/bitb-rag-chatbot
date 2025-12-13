import { Queue, Worker, QueueScheduler, Job } from 'bullmq';

type OnboardingJobData = Record<string, any> & { type: string; tenantId: string };
type OnboardingProcessor = (job: Job<OnboardingJobData>) => Promise<any>;

function resolveBullmqConnection(): any {
  const bullUrl = process.env.BULLMQ_REDIS_URL;
  const redisEnvUrl = process.env.REDIS_URL;

  if (bullUrl) {
    console.log('[DEBUG] onboardingQueue resolveBullmqConnection: using BULLMQ_REDIS_URL');
    if (!bullUrl.startsWith('redis://') && !bullUrl.startsWith('rediss://')) {
      throw new Error(`Invalid BullMQ Redis URL scheme. Expected redis:// or rediss://, got: ${bullUrl.split(':')[0]}://...`);
    }
    return { url: bullUrl };
  }

  if (redisEnvUrl) {
    console.log('[DEBUG] onboardingQueue resolveBullmqConnection: using REDIS_URL');
    if (!redisEnvUrl.startsWith('redis://') && !redisEnvUrl.startsWith('rediss://')) {
      throw new Error(`Invalid BullMQ Redis URL scheme. Expected redis:// or rediss://, got: ${redisEnvUrl.split(':')[0]}://...`);
    }
    return { url: redisEnvUrl };
  }

  // Fallback behavior:
  // - In dev, BullMQ defaults to localhost:6379 if no connection is provided.
  // - We intentionally do NOT create any Queue/Worker at import-time, so builds
  //   won't attempt to connect.
  return undefined;
}

let _queue: Queue<OnboardingJobData> | null = null;
let _scheduler: QueueScheduler | null = null;
let _worker: Worker<OnboardingJobData> | null = null;

export function getOnboardingQueue() {
  if (!_queue) {
    _queue = new Queue<OnboardingJobData>('onboarding', { connection: resolveBullmqConnection() });
  }
  return _queue;
}

export function getOnboardingQueueScheduler() {
  if (!_scheduler) {
    _scheduler = new QueueScheduler('onboarding', { connection: resolveBullmqConnection() });
  }
  return _scheduler;
}

export function startOnboardingWorker(processor?: OnboardingProcessor) {
  if (_worker) return _worker;

  const defaultProcessor: OnboardingProcessor = async (job) => {
    if (job.data.type === 'catalog_ingestion') {
      return { status: 'catalog_ingested', jobId: job.id };
    }
    if (job.data.type === 'update_settings') {
      return { status: 'theme_updated', jobId: job.id };
    }
    return { status: 'unknown', jobId: job.id };
  };

  _worker = new Worker<OnboardingJobData>(
    'onboarding',
    async (job) => (processor || defaultProcessor)(job),
    { connection: resolveBullmqConnection() }
  );

  return _worker;
}

export function getOnboardingWorker() {
  return _worker;
}

// Usage:
// await onboardingQueue.add('catalog_ingestion', { type: 'catalog_ingestion', tenantId: 'tn_...' });
// await onboardingQueue.add('update_settings', { type: 'update_settings', tenantId: 'tn_...' });

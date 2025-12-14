
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Ensure .env.local is loaded for standalone worker processes.
// Next.js loads .env.local automatically, but plain Node processes do not.
const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import { startTenantPipelineWorker } from '../lib/queues/tenantPipelineQueue';
import '../lib/queues/shutdown-handler';
import { logger } from '../lib/observability/logger';

// Dedicated process entrypoint for tenant pipeline ingestion jobs.
// Run via: npx ts-node --esm src/workers/tenantPipelineWorker.ts

const concurrency = Math.max(1, Number(process.env.TENANT_PIPELINE_WORKER_CONCURRENCY ?? 2));

startTenantPipelineWorker({ concurrency });

logger.info('Tenant pipeline worker started', {
  queue: 'tenant_pipeline',
  concurrency,
  redis: Boolean(process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL),
});

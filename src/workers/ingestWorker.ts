
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

import { getIngestionWorker } from '../lib/queues/ingestQueue';
import '../lib/queues/shutdown-handler';
import { logger } from '../lib/observability/logger';

// Dedicated process entrypoint for ingestion jobs.
// Run via: npx ts-node --esm src/workers/ingestWorker.ts

const worker = getIngestionWorker();

logger.info('Ingestion worker started', {
    queue: 'ingest',
    redis: Boolean(process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL),
});

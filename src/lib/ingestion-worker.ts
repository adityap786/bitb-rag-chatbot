import { startIngestionWorker, IngestionJobData } from './ingestion-queue';
import llamaindex from './llamaindex_adapter';
import { Job } from 'bullmq';

// Worker job processor: calls the LlamaIndex microservice for ingestion
async function processIngestionJob(job: Job<IngestionJobData>) {
  const { tenant_id, doc_id, payload, metadata } = job.data;
  // Call the LlamaIndex microservice ingest endpoint
  return llamaindex.ingest(
    tenant_id,
    doc_id,
    payload.content,
    metadata || {},
    metadata?.opts || {}
  );
}

export function startWorker() {
  const worker = startIngestionWorker(processIngestionJob);
  console.log('[IngestionWorker] Started and listening for jobs...');
  return worker;
}

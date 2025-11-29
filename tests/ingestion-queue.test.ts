
// Ensure .env variables (like REDIS_URL) are loaded before any queue code runs
import dotenv from 'dotenv';
dotenv.config();

import { enqueueIngestionJob } from '../src/lib/ingestion-queue';
import { getIngestionJobStatus } from '../src/lib/ingestion-job-status';
import { ingestionQueue } from '../src/lib/ingestion-queue';

describe('Ingestion Queue System', () => {
  let jobId: string;
  const testJob: any = {
    tenant_id: 'test-tenant',
    doc_id: 'test-doc',
    source: 'upload',
    payload: { content: 'test content' },
    metadata: { test: true }
  };

  afterAll(async () => {
    await ingestionQueue.close();
  });

  it('should enqueue an ingestion job and return a job id', async () => {
    const job = await enqueueIngestionJob(testJob);
    expect(job.id).toBeDefined();
    jobId = job.id!;
  });

  it('should report job status as waiting or active after enqueue', async () => {
    const status = await getIngestionJobStatus(jobId);
    expect(['waiting', 'active', 'completed', 'failed']).toContain(status.status);
    expect(status.job_id).toBe(jobId);
  });

  it('should eventually complete or fail the job', async () => {
    let status;
    for (let i = 0; i < 20; i++) {
      status = await getIngestionJobStatus(jobId);
      if (status.status === 'completed' || status.status === 'failed') break;
      await new Promise(res => setTimeout(res, 500));
    }
    expect(['completed', 'failed']).toContain(status?.status);
  });
});

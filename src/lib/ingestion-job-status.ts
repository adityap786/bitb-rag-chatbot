import { getIngestionQueue } from './ingestion-queue';
import { Job } from 'bullmq';

/**
 * Get ingestion job status by job ID.
 * Returns job state, progress, result, and error if any.
 */
export async function getIngestionJobStatus(job_id: string) {
  const job = (await getIngestionQueue().getJob(job_id)) || null;
  if (!job) return { job_id, status: 'not_found' };
  const state = await job.getState();
  return {
    job_id,
    status: state,
    progress: job.progress,
    result: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    createdAt: job.timestamp,
    finishedAt: job.finishedOn,
    updatedAt: job.processedOn,
    data: job.data
  };
}

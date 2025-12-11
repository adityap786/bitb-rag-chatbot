export type PipelineReadinessInput = {
  ragStatus: string | null;
  lastJobStatus: string | null;
  vectorCount: number;
  minVectors: number;
};

/**
 * Decide whether a tenant's RAG pipeline is ready.
 * Ready if:
 * - rag_status already marked active/ready, OR
 * - latest job completed AND meets vector threshold, OR
 * - vectors meet threshold even if status metadata lags.
 */
export function isPipelineReady({ ragStatus, lastJobStatus, vectorCount, minVectors }: PipelineReadinessInput) {
  if (ragStatus === 'ready' || ragStatus === 'active') return true;
  if (vectorCount >= Math.max(minVectors, 0)) return true;
  if (lastJobStatus === 'completed') return true;
  return false;
}

export type PipelineReadinessInput = {
  ragStatus: string | null;
  lastJobStatus: string | null;
  vectorCount: number;
  minVectors: number;
};

/**
 * Decide whether a tenant's RAG pipeline is ready.
 * Ready if:
 * - status already marked ready, OR
 * - meets the vector threshold (even if an ingestion job is still running).
 */
export function isPipelineReady({ ragStatus, lastJobStatus, vectorCount, minVectors }: PipelineReadinessInput) {
  const threshold = Math.max(minVectors, 0);

  // Explicit "ready" flags override everything.
  if (ragStatus === 'ready') return true;

  // If threshold is 0, treat as always-ready.
  if (threshold === 0) return true;

  // Primary gating: if we have enough vectors, RAG can serve queries.
  if (vectorCount >= threshold) return true;

  // Otherwise not ready.
  return false;
}

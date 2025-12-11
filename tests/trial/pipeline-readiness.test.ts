import { describe, it, expect } from 'vitest';
import { isPipelineReady } from '@/lib/trial/pipeline-readiness';

describe('pipeline readiness evaluation', () => {
  it('is ready when rag_status is ready', () => {
    expect(
      isPipelineReady({ ragStatus: 'ready', lastJobStatus: null, vectorCount: 0, minVectors: 10 })
    ).toBe(true);
  });

  it('is ready when vector threshold met', () => {
    expect(
      isPipelineReady({ ragStatus: 'pending', lastJobStatus: 'processing', vectorCount: 12, minVectors: 10 })
    ).toBe(true);
  });

  it('is ready when last job completed even if vectors below threshold', () => {
    expect(
      isPipelineReady({ ragStatus: 'pending', lastJobStatus: 'completed', vectorCount: 1, minVectors: 10 })
    ).toBe(true);
  });

  it('is not ready when pending and no vectors', () => {
    expect(
      isPipelineReady({ ragStatus: 'pending', lastJobStatus: 'processing', vectorCount: 0, minVectors: 5 })
    ).toBe(false);
  });
});

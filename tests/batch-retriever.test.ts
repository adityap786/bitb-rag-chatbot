import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TenantIsolatedRetriever } from '@/lib/rag/supabase-retriever-v2';
import { BatchRetriever } from '@/lib/rag/batch-retriever';

const createDocument = (id: string) =>
  ({
    pageContent: `content-${id}`,
    metadata: { id },
  });

describe('BatchRetriever', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('deduplicates documents between batch requests', async () => {
    const retriever = {
      retrieve: vi.fn(async (query: string) => {
        if (query === 'alpha') {
          return [createDocument('d1'), createDocument('d2')];
        }
        if (query === 'beta') {
          return [createDocument('d2'), createDocument('d3')];
        }
        return [];
      }),
    } as unknown as TenantIsolatedRetriever;

    const batchRetriever = new BatchRetriever(retriever, { ttlMs: 5_000, concurrency: 2 });

    const results = await batchRetriever.retrieveBatch([
      { query: 'alpha' },
      { query: 'beta' },
    ]);

    expect(results[0].documents.map((doc) => doc.metadata?.id)).toEqual(['d1', 'd2']);
    expect(results[1].documents.map((doc) => doc.metadata?.id)).toEqual(['d3']);
    expect(retriever.retrieve).toHaveBeenCalledTimes(2);
  });

  it('returns cached results when the same request repeats within TTL', async () => {
    const retriever = {
      retrieve: vi.fn(async () => [createDocument('c1')]),
    } as unknown as TenantIsolatedRetriever;

    const batchRetriever = new BatchRetriever(retriever, { ttlMs: 10_000, concurrency: 1 });

    const first = await batchRetriever.retrieveBatch([{ query: 'cached' }]);
    const second = await batchRetriever.retrieveBatch([{ query: 'cached' }]);

    expect(first[0].cached).toBe(false);
    expect(second[0].cached).toBe(true);
    expect(second[0].latencyMs).toBe(0);
    expect(retriever.retrieve).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when TTL expires between requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const retriever = {
      retrieve: vi.fn(async () => [createDocument('x1')]),
    } as unknown as TenantIsolatedRetriever;

    const batchRetriever = new BatchRetriever(retriever, { ttlMs: 1_000, concurrency: 1 });

    await batchRetriever.retrieveBatch([{ query: 'ttl' }]);

    vi.setSystemTime(1_500);
    await batchRetriever.retrieveBatch([{ query: 'ttl' }]);

    expect(retriever.retrieve).toHaveBeenCalledTimes(2);
  });
});

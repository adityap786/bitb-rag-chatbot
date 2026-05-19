import { describe, it, expect } from 'vitest';
import { storeEmbedding, queryEmbeddings } from '../../src/lib/rag/embeddings';

describe('RAG Embeddings', () => {
  it('should store and query embeddings for a tenant', async () => {
    await storeEmbedding({ tenantId: 'test-tenant-1', chunkId: 'chunk-1', embedding: Array(768).fill(0.5) });
    const results = await queryEmbeddings({ tenantId: 'test-tenant-1', vector: Array(768).fill(0.5), topK: 1 });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('chunk_id');
  });
});

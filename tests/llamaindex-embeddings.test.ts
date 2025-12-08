import { describe, it, expect, beforeAll } from 'vitest';
import { LlamaIndexEmbeddingService } from '@/lib/rag/llamaindex-embeddings';

/**
 * Embedding validation tests for LlamaIndex
 * Success criteria: correct dimensions, batch consistency, and performance
 */

describe('LlamaIndex Embedding Service', () => {
  // No global timeout; use per-test timeouts only
  let llamaindexEmbedder: LlamaIndexEmbeddingService;
  const testTexts = [
    'The quick brown fox jumps over the lazy dog',
    'Machine learning is a subset of artificial intelligence',
    'LlamaIndex provides indexing and retrieval for RAG systems',
  ];

  beforeAll(() => {
    llamaindexEmbedder = LlamaIndexEmbeddingService.getInstance();
  });

  // Removed 1536-dim embedding test

  it('batch embeddings match single embeddings', async () => {
    const batchEmbed = await llamaindexEmbedder.embedBatch([testTexts[0]]);
    const singleEmbed = await llamaindexEmbedder.embed(testTexts[0]);

    expect(batchEmbed).toHaveLength(1);
    expect(batchEmbed[0]).toEqual(singleEmbed);
  }, 20000);

  it('batch embeddings produce consistent results', async () => {
    const batch = await llamaindexEmbedder.embedBatch(testTexts);
    expect(batch).toHaveLength(testTexts.length);
    batch.forEach((embedding: any) => {
      expect(embedding).toHaveLength(768);
    });
  }, 20000);

  it('handles batch operations efficiently', async () => {
    const start = Date.now();
    const batch = await llamaindexEmbedder.embedBatch(testTexts);
    const duration = Date.now() - start;

    expect(batch).toHaveLength(testTexts.length);
    expect(duration).toBeLessThan(20000); // Should complete within 20 seconds
  }, 20000);
});
describe('LlamaIndex Embedding Service (BGE)', () => {
  // No global timeout; use per-test timeouts only
  it('produces correct embedding dimensions (768)', async () => {
    const service = LlamaIndexEmbeddingService.getInstance();
    const embedding = await service.embed('hello world');
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(768);
    expect(typeof embedding[0]).toBe('number');
  }, 20000);

  it('batch embeddings match single embeddings', async () => {
    const service = LlamaIndexEmbeddingService.getInstance();
    const texts = ['hello', 'world'];
    const single = await Promise.all(texts.map(t => service.embed(t)));
    const batch = await service.embedBatch(texts);
    expect(batch.length).toBe(texts.length);
    for (let i = 0; i < texts.length; i++) {
      expect(batch[i].length).toBe(768);
      expect(batch[i]).toEqual(single[i]);
    }
  }, 20000);

  it('batch embeddings produce consistent results', async () => {
    const service = LlamaIndexEmbeddingService.getInstance();
    const texts = ['foo', 'bar', 'baz'];
    const batch1 = await service.embedBatch(texts);
    const batch2 = await service.embedBatch(texts);
    expect(batch1).toEqual(batch2);
  }, 20000);

  it('handles batch operations efficiently', async () => {
    const service = LlamaIndexEmbeddingService.getInstance();
    const texts = Array.from({ length: 10 }, (_, i) => `text ${i}`);
    const batch = await service.embedBatch(texts);
    expect(batch.length).toBe(10);
    for (const emb of batch) {
      expect(emb.length).toBe(768);
    }
  }, 20000);
});

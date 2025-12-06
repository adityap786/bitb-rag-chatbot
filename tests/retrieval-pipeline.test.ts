import { describe, it, expect, vi } from 'vitest';
import { RetrievalPipeline } from '../src/lib/rag/retrieval-pipeline';

describe('RetrievalPipeline', () => {
  const mockChunks = [
    { content: 'chunk1', metadata: { idx: 0 } },
    { content: 'chunk2', metadata: { idx: 1 } },
  ];
  const chunker = { parse: vi.fn(async () => mockChunks) };
  const hybridSearch: any = { search: vi.fn(async (query) => [{ content: 'retrieved', score: 1 }]) };

  it('ingests documents using the chunker', async () => {
    const pipeline = new RetrievalPipeline({ chunker, hybridSearch });
    const doc = { content: 'test doc', metadata: { foo: 'bar' } };
    const chunks = await pipeline.ingest(doc);
    expect(chunker.parse).toHaveBeenCalledWith(doc);
    // The retrieval pipeline enriches chunks; ensure content matches the chunker output
    expect(chunks.map(c => c.content)).toEqual(mockChunks.map(c => c.content));
    // Ensure each enriched chunk has tenant set and embedding array when embedding service is available
    for (const c of chunks) {
      expect(c).toHaveProperty('metadata');
      expect(c.metadata).toHaveProperty('tenant_id');
      expect(c.metadata).toHaveProperty('embedding');
    }
  });

  it('retrieves using hybrid search', async () => {
    const pipeline = new RetrievalPipeline({ chunker, hybridSearch });
    const results = await pipeline.retrieve('query');
    expect(hybridSearch.search).toHaveBeenCalledWith('query');
    expect(results[0].content).toBe('retrieved');
  });
});

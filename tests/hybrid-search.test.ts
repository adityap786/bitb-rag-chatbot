import { describe, it, expect, vi } from 'vitest';
import { HybridSearch } from '../src/lib/rag/hybrid-search.js';

describe('HybridSearch', () => {
  const vectorSearch = vi.fn(async (query, topK) => {
    return [
      { content: 'vector result 1', score: 0.9 },
      { content: 'shared result', score: 0.8 },
    ];
  });
  const keywordSearch = vi.fn(async (query, topK) => {
    return [
      { content: 'keyword result 1', score: 0.7 },
      { content: 'shared result', score: 0.6 },
    ];
  });
  const rerank = vi.fn(async (results, query) => results.reverse());

  it('merges and reranks results from both search types', async () => {
    const search = new HybridSearch({ vectorSearch, keywordSearch, rerank, topK: 3, alpha: 0.6 });
    const results = await search.search('test query');
    expect(results.length).toBe(3);
    // The merged order before rerank is: [vector result 1, shared result, keyword result 1]
    // After rerank (reverse): [keyword result 1, vector result 1, shared result]
    expect(results.map((r: any) => r.content)).toEqual([
      'keyword result 1',
      'vector result 1',
      'shared result',
    ]);
    expect(vectorSearch).toHaveBeenCalled();
    expect(keywordSearch).toHaveBeenCalled();
    expect(rerank).toHaveBeenCalled();
  });

  it('works without rerank', async () => {
    const search = new HybridSearch({ vectorSearch, keywordSearch, topK: 2, alpha: 0.5 });
    const results = await search.search('test query');
    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });
});

import { describe, it, expect, vi } from 'vitest';

// Vitest hoists vi.mock, so mocks must be at the top
vi.mock('@/lib/supabase-client', () => ({
  createLazyServiceClient: () => ({
    rpc: vi.fn().mockResolvedValue({ data: [
      { embedding_id: 'e1', kb_id: 'kb1', chunk_text: 'vector match text', similarity: 0.9, metadata: {} },
      { embedding_id: 'e2', kb_id: 'kb2', chunk_text: 'vector match text 2', similarity: 0.7, metadata: {} },
    ], error: null }),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    mockResolvedValue: vi.fn().mockResolvedValue({ data: [
      { kb_id: 'kb2', raw_text: 'fallback text match', metadata: {} },
      { kb_id: 'kb3', raw_text: 'another fallback', metadata: {} },
    ], error: null }),
  }),
}));


vi.mock('@/lib/trial/embeddings', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

import { hybridSearch } from '@/lib/trial/rag-pipeline';

describe('hybridSearch', () => {
  it('returns merged, ranked, redacted results', async () => {
    const results = await hybridSearch('tn_' + 'a'.repeat(32), 'match', 3, 0.7);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('embedding_id');
    expect(results[0]).toHaveProperty('chunk_text');
    expect(results[0].chunk_text).not.toMatch(/@/); // PII redaction
  });

  it('throws if tenantId missing', async () => {
    await expect(hybridSearch('', 'query', 3, 0.7)).rejects.toThrow(/TENANT_ID_REQUIRED/);
  });

  it('limits results to topK', async () => {
    const results = await hybridSearch('tn_' + 'a'.repeat(32), 'match', 2, 0.7);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

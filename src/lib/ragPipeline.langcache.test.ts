import { describe, it, expect, vi } from 'vitest';
import * as langcacheApi from './langcache-api';
import { mcpHybridRagQuery } from './ragPipeline';

vi.mock('./langcache-api');

describe('RAG Pipeline - LangCache SaaS Integration', () => {
  it('should use langCacheSearch and return cached response if available', async () => {
    const fakeCache = {
      response: {
        answer: 'Cached answer',
        sources: [],
        confidence: 0.99,
        llmError: null,
        llmProvider: 'groq',
        llmModel: 'llama-3',
        latencyMs: 10,
        characterLimitApplied: null,
        originalLength: 13,
      },
    };
    (langcacheApi.langCacheSearch as any).mockResolvedValue(fakeCache);
    (langcacheApi.langCacheSet as any).mockResolvedValue({ ok: true });
    const result = await mcpHybridRagQuery({
      tenantId: 'tn_' + 'a'.repeat(32),
      query: 'What is BiTB?',
    });
    expect(result.answer).toBe('Cached answer');
    expect(result.cache).toBe(true);
  });

  it('should call langCacheSet after LLM inference', async () => {
    (langcacheApi.langCacheSearch as any).mockResolvedValue({});
    const setSpy = vi.spyOn(langcacheApi, 'langCacheSet').mockResolvedValue({ ok: true });
    const result = await mcpHybridRagQuery({
      tenantId: 'tn_' + 'a'.repeat(32),
      query: 'What is BiTB?',
    });
    expect(setSpy).toHaveBeenCalled();
    expect(result).toHaveProperty('answer');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createLlm } from '@/lib/rag/llm-factory';

describe('LLM Factory - GROQ', () => {
  it('invokes groq adapter and returns text', async () => {
    process.env.BITB_LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'fake-key';
    process.env.GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
    process.env.BITB_LLM_MODEL = 'llama-3.1-70b-instruct';

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Hello from Groq' } }] }),
      status: 200,
      statusText: 'OK',
    })) as any;

    const llm = await createLlm();
    expect(llm).toBeTruthy();
    if (!llm) {
      throw new Error('LLM adapter not initialized');
    }
    const out = await llm.invoke('Tell me something');
    expect(out).toBe('Hello from Groq');
  });
});

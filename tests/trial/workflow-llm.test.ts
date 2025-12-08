import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM factory used by workflow-llm
vi.mock('../../src/lib/rag/llamaindex-llm-factory.js', () => ({
  createLlamaIndexLlm: vi.fn(),
}));

import { WorkflowLlamaIndexService } from '../../src/lib/trial/workflow-llm';
import { createLlamaIndexLlm } from '../../src/lib/rag/llamaindex-llm-factory.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('WorkflowLlamaIndexService', () => {
  it('returns reject assessment for empty docs', async () => {
    const svc = new WorkflowLlamaIndexService();
    const res = await svc.assessKBQuality([], 'tenantX');
    expect(res.quality_score).toBe(0);
    expect(res.details?.reason).toBe('empty_kb');
  });

  it('uses LLM invoke result when available', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('ok') };
    (createLlamaIndexLlm as unknown as any).mockResolvedValue(mockLlm);
    const svc = new WorkflowLlamaIndexService();
    const docs = [{ id: '1', content: 'hello world' }];
    const res = await svc.assessKBQuality(docs, 'tenantX');
    expect(res.quality_score).toBe(1);
    expect(res.details?.llm_response).toBe('ok');
    expect(mockLlm.invoke).toHaveBeenCalled();
  });

  it('handles LLM unavailable', async () => {
    (createLlamaIndexLlm as unknown as any).mockResolvedValue(undefined);
    const svc = new WorkflowLlamaIndexService();
    const docs = [{ id: '1', content: 'abc' }];
    const res = await svc.assessKBQuality(docs, 'tenantX');
    expect(res.details?.llm_response).toBe('LLM unavailable');
  });
});

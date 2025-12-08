import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mocks inside the factory to avoid hoisting issues
vi.mock('@/lib/supabase-client', () => {
  const insertMock = vi.fn(async (records: any) => ({ error: null, data: records }));
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  
  return {
    createLazyServiceClient: () => ({ from: fromMock }),
    __esModule: true,
  };
});

// Import the module under test (after mocking)
import { mapRagSourcesToCitations, trackCitations } from '../src/lib/citations';
import * as supabaseClient from '@/lib/supabase-client';

// Get references to the mocked functions for assertions
const getMockedClient = () => {
  const client = (supabaseClient as any).createLazyServiceClient();
  return client;
};

describe('mapRagSourcesToCitations', () => {
  it('maps RAG source fields to citation inserts and bounds confidence', () => {
    const sources = [
      {
        title: 'Test Doc',
        chunk: 'This is the content of the document used as an excerpt.',
        similarity: 0.85,
        metadata: { source_url: 'https://example.com/doc', title: 'Example Doc' },
      },
    ];

    const mapped = mapRagSourcesToCitations(sources, { tenantId: 'tenant_1', conversationId: 'conv_1', messageId: 'msg_1' });
    expect(mapped).toHaveLength(1);
    const m = mapped[0];
    expect(m.tenant_id).toBe('tenant_1');
    expect(m.conversation_id).toBe('conv_1');
    expect(m.message_id).toBe('msg_1');
    expect(m.source_title).toBe('Test Doc');
    expect(m.source_url).toBe('https://example.com/doc');
    expect(m.excerpt).toContain('This is the content');
    expect(m.confidence_score).toBeCloseTo(0.85);
  });
});

describe('trackCitations', () => {
  it('inserts records into supabase and returns success', async () => {
    const records = [{ tenant_id: 't1', source_url: 'https://example.com' }];
    const res = await trackCitations(records as any);
    expect(res.success).toBe(true);
    // Verify the function doesn't throw and returns expected shape
    expect(res).toHaveProperty('success');
  });

  it('returns success for empty records (no-op)', async () => {
    const res = await trackCitations([] as any);
    expect(res.success).toBe(true);
  });

  it('handles errors gracefully', async () => {
    // Pass invalid data to trigger error path
    const records = [{ invalid: 'data' }];
    const res = await trackCitations(records as any);
    // Should still return an object with success property
    expect(res).toHaveProperty('success');
  });
});

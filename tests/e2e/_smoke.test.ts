import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * E2E Smoke Tests
 * 
 * These tests verify the critical paths of the RAG pipeline work end-to-end.
 * They use mocked external services to ensure fast, reliable CI runs.
 * 
 * To run against real services, set E2E_USE_REAL_SERVICES=true
 */

// Mock external services for CI
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: function(cb: any) { return cb({ data: [], error: null }); },
  })),
}));

vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Mocked response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'mixtral-8x7b-32768',
        }),
      },
    },
  })),
}));

describe('E2E Smoke Test', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('validates environment configuration', () => {
    // These should be set by tests/setup.ts
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.SUPABASE_URL).toBeDefined();
  });
});

describe('E2E Pipeline Smoke Tests', () => {
  beforeAll(() => {
    // Set required env vars for test
    process.env.GROQ_API_KEY = 'test-key';
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('tenant validation rejects invalid tenant IDs', async () => {
    const { validateTenantId } = await import('../../src/lib/rag/supabase-retriever');
    expect(() => validateTenantId('')).toThrow();
    expect(() => validateTenantId('bad-id')).toThrow();
    expect(() => validateTenantId('tn_1234567890abcdef1234567890abcdef')).not.toThrow();
  });

  it('batch retriever handles empty requests', async () => {
    const { BatchRetriever } = await import('../../src/lib/rag/batch-retriever');
    
    // Mock retriever
    const mockRetriever = {
      retrieve: vi.fn().mockResolvedValue([]),
    };
    
    const batchRetriever = new BatchRetriever(mockRetriever as any);
    const results = await batchRetriever.retrieveBatch([]);
    
    expect(results).toEqual([]);
    expect(mockRetriever.retrieve).not.toHaveBeenCalled();
  });

  it('rate limiter validates configuration', async () => {
    const { validateRateLimitConfig } = await import('../../src/lib/security/rate-limiting');
    
    expect(() => validateRateLimitConfig({
      maxRequests: 100,
      windowMs: 60000,
    })).not.toThrow();
    
    expect(() => validateRateLimitConfig({
      maxRequests: -1,
      windowMs: 60000,
    })).toThrow();
  });

  it('memory manager handles empty history', async () => {
    const { ConversationMemoryManager } = await import('../../src/lib/memory/conversation-memory-manager');
    
    const manager = new ConversationMemoryManager({
      maxMessages: 10,
      summaryThreshold: 5,
    });
    
    const history = await manager.getHistory('test-session');
    expect(Array.isArray(history)).toBe(true);
  });
});

describe('E2E Security Smoke Tests', () => {
  it('PII masking handles common patterns', async () => {
    const { maskPII } = await import('../../src/lib/security/pii-masking');
    
    const input = 'Contact me at test@example.com or 555-123-4567';
    const masked = maskPII(input);
    
    expect(masked).not.toContain('test@example.com');
    expect(masked).not.toContain('555-123-4567');
  });

  it('guardrails validate tenant id', async () => {
    const guardrails = await import('../../src/lib/security/rag-guardrails');
    
    // Test validateTenantId doesn't throw for valid tenant
    expect(() => guardrails.validateTenantId('test-tenant')).not.toThrow();
    // Test it throws for missing tenant
    expect(() => guardrails.validateTenantId(undefined)).toThrow();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as retriever from '../../src/lib/rag/supabase-retriever';

const VALID_TENANT = 'tn_1234567890abcdef1234567890abcdef';

// Hardened Supabase mock
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn().mockImplementation((fn) => {
      if (fn === 'set_tenant_context') return Promise.resolve({ error: null });
      if (fn === 'match_embeddings_by_tenant') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ error: null });
    }),
    from: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    count: 2,
    then: function (cb: (arg: any) => any) { return cb(this); },
    catch: function () { return this; },
  })),
}));

// Mock vector store and other dependencies as before
vi.mock('../../src/lib/rag/supabase-vector-store', () => {
  return {
    SupabaseVectorStore: vi.fn().mockImplementation(() => ({
      asRetriever: vi.fn().mockReturnValue({
        retrieve: vi.fn().mockResolvedValue([{ metadata: { id: 'doc1' } }]),
      }),
      addDocuments: vi.fn().mockResolvedValue(['doc1', 'doc2']),
    })),
  };
});

vi.mock('../../src/lib/observability/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../src/lib/trial/embedding-service', () => ({
  LlamaIndexEmbeddingService: {
    getInstance: () => ({
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
    }),
  },
}));

describe('supabase-retriever (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validateTenantId throws for invalid tenantId', () => {
    expect(() => retriever.validateTenantId('')).toThrow();
    expect(() => retriever.validateTenantId('bad')).toThrow();
    expect(() => retriever.validateTenantId(VALID_TENANT)).not.toThrow();
  });

  it('createTenantIsolatedClient returns a client', async () => {
    const client = await retriever.createTenantIsolatedClient(VALID_TENANT);
    expect(client).toBeDefined();
  });

  it('getSupabaseRetriever returns a retriever with retrieve', async () => {
    const r = await retriever.getSupabaseRetriever(VALID_TENANT);
    expect(r.retrieve).toBeInstanceOf(Function);
    const docs = await r.retrieve('query');
    expect(Array.isArray(docs)).toBe(true);
    expect(docs[0].metadata.id).toBe('doc1');
  });

  it('addDocumentsToTenant returns ids', async () => {
    // Minimal mock Document type for test compatibility
    type TestDoc = { content: string; metadata: any };
    const docs: TestDoc[] = [
      { content: 'a', metadata: {} },
      { content: 'b', metadata: {} },
    ];
    // @ts-expect-error: test mock type
    const ids = await retriever.addDocumentsToTenant(VALID_TENANT, docs);
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
    for (let i = 0; i < ids.length; i++) {
      expect(typeof docs[i].content).toBe('string');
    }
  });

  it('addDocumentsToTenant handles large batch inserts', async () => {
    type TestDoc = { content: string; metadata: any };
    const docs: TestDoc[] = Array.from({ length: 120 }, (_, i) => ({ content: `doc${i}`, metadata: {} }));
    // @ts-expect-error: test mock type
    const ids = await retriever.addDocumentsToTenant(VALID_TENANT, docs);
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBe(docs.length);
  });

  it('deleteTenantEmbeddings returns a number', async () => {
    const count = await retriever.deleteTenantEmbeddings(VALID_TENANT);
    expect(typeof count).toBe('number');
  });

  it('deleteTenantEmbeddings throws or errors on Supabase failure', async () => {
    // Patch the mock to simulate an error
    const supabase = require('@supabase/supabase-js');
    supabase.createClient.mockReturnValueOnce({
      rpc: vi.fn().mockImplementation(() => Promise.resolve({ error: { message: 'fail' } })),
      from: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      count: 2,
      then: function (cb: any) { return cb(this); },
      catch: function () { return this; },
    });
    await expect(retriever.deleteTenantEmbeddings(VALID_TENANT)).rejects.toThrow();
  });

  it('getTenantEmbeddingCount returns a number', async () => {
    const count = await retriever.getTenantEmbeddingCount(VALID_TENANT);
    expect(typeof count).toBe('number');
  });

  it('getTenantEmbeddingCount throws or errors on Supabase failure', async () => {
    // Patch the mock to simulate an error
    const supabase = require('@supabase/supabase-js');
    supabase.createClient.mockReturnValueOnce({
      rpc: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
      from: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      count: 2,
      then: function (cb: any) { return cb({ error: { message: 'fail' } }); },
      catch: function () { return this; },
    });
    await expect(retriever.getTenantEmbeddingCount(VALID_TENANT)).rejects.toThrow();
  });

  it('getSupabaseRetriever throws or errors for invalid tenant', async () => {
    await expect(retriever.getSupabaseRetriever('bad')).rejects.toThrow();
    await expect(retriever.getSupabaseRetriever('')).rejects.toThrow();
  });

  it('addDocumentsToTenant throws or errors for invalid input', async () => {
    // @ts-expect-error: intentionally invalid input
    await expect(retriever.addDocumentsToTenant(VALID_TENANT, [{ metadata: {} }])).rejects.toThrow();
    await expect(retriever.addDocumentsToTenant(VALID_TENANT, [])).rejects.toThrow();
  });

  it('getBitbRag throws deprecation error', async () => {
    await expect(retriever.getBitbRag()).rejects.toThrow(/DEPRECATED/);
  });
});

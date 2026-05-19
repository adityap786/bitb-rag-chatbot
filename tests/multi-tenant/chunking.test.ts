import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../../src/lib/rag/chunking';

describe('RAG Chunking', () => {
  it('should chunk a document for a tenant', async () => {
    const chunks = await chunkDocument({ tenantId: 'test-tenant-1', documentId: 'doc-id-1', chunkSize: 10, overlap: 2 });
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });
});

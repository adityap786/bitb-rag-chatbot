import { describe, it, expect } from 'vitest';
import { retrieveDocuments } from '../../src/lib/rag/retrieval';

describe('RAG Retrieval', () => {
  it('should retrieve relevant chunks for a tenant', async () => {
    const chunks = await retrieveDocuments({ tenantId: 'test-tenant-1', queryVector: Array(768).fill(0.5), topK: 1 });
    expect(Array.isArray(chunks)).toBe(true);
  });
});

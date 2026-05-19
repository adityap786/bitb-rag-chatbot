import { describe, it, expect } from 'vitest';
import { ingestDocument } from '../../src/lib/rag/ingestion';

describe('RAG Ingestion', () => {
  it('should ingest a document for a tenant', async () => {
    const doc = await ingestDocument({ tenantId: 'test-tenant-1', document: 'Hello world', metadata: { source: 'test' } });
    expect(doc).toHaveProperty('id');
    expect(doc.tenant_id).toBe('test-tenant-1');
    expect(doc.content).toBe('Hello world');
    expect(doc.metadata.source).toBe('test');
  });
});

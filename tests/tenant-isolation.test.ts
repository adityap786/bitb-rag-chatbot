import { describe, expect, it } from 'vitest';
import { TenantIsolationGuard } from '@/lib/rag/tenant-isolation';
import { langchainToLlama, llamaToLangchainShape } from '@/lib/rag/llamaindex-adapters';

const TENANT_ID = 'tenant_test_1';

describe('TenantIsolationGuard', () => {
  const guard = new TenantIsolationGuard(TENANT_ID);

  it('enforces tenant_id on LangChain docs', () => {
    const doc = { pageContent: 'foo', metadata: { some: 'meta' } };
    const [result] = guard.enforceWriteIsolation([doc]) as any;
    expect((result.metadata as any).tenant_id).toBe(TENANT_ID);
  });

  it('enforces tenant_id on LlamaIndex docs', () => {
    const doc = { content: 'bar', metadata: { other: 'meta' } };
    const [result] = guard.enforceWriteIsolation([doc]) as any;
    expect((result.metadata as any).tenant_id).toBe(TENANT_ID);
  });

  it('throws on cross-tenant retrieval (LangChain)', () => {
    const doc = { pageContent: 'foo', metadata: { tenant_id: 'wrong' } };
    expect(() => guard.validateRetrievedDocuments([doc], { operation: 'test' })).toThrow();
  });

  it('throws on cross-tenant retrieval (LlamaIndex)', () => {
    const doc = { content: 'bar', metadata: { tenant_id: 'wrong' } };
    expect(() => guard.validateRetrievedDocuments([doc], { operation: 'test' })).toThrow();
  });

  it('passes for correct tenant_id', () => {
    const doc = { content: 'ok', metadata: { tenant_id: TENANT_ID } };
    expect(() => guard.validateRetrievedDocuments([doc], { operation: 'test' })).not.toThrow();
  });

  it('preserves tenant_id through adapter conversions', () => {
    const lcDoc = { pageContent: 'foo', metadata: { tenant_id: TENANT_ID } };
    const llamaDoc = langchainToLlama(lcDoc);
    expect(llamaDoc.metadata?.tenant_id).toBe(TENANT_ID);
    const back = llamaToLangchainShape(llamaDoc);
    expect(back.metadata?.tenant_id).toBe(TENANT_ID);
  });
});

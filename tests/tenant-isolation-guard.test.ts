import { describe, expect, it } from 'vitest';

import { TenantIsolationGuard, TenantIsolationViolationError } from '@/lib/rag/tenant-isolation';

const createDoc = (tenantId?: string) =>
  ({ pageContent: 'payload', metadata: tenantId ? { tenant_id: tenantId } : {} });

describe('TenantIsolationGuard', () => {
  it('enforces tenant metadata on writes', () => {
    const guard = new TenantIsolationGuard('tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const [doc] = guard.enforceWriteIsolation([createDoc()]);
    expect(doc.metadata?.tenant_id).toBe('tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('validates matching documents without throwing', () => {
    const tenantId = 'tn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const guard = new TenantIsolationGuard(tenantId);
    expect(() =>
      guard.validateRetrievedDocuments([createDoc(tenantId)], {
        operation: 'test',
      })
    ).not.toThrow();
  });

  it('throws when document tenant mismatches', () => {
    const guard = new TenantIsolationGuard('tn_cccccccccccccccccccccccccccccccc');
    expect(() =>
      guard.validateRetrievedDocuments([createDoc('tn_dddddddddddddddddddddddddddddddd')], {
        operation: 'test',
      })
    ).toThrow(TenantIsolationViolationError);
  });

  it('asserts payload tenant integrity', () => {
    const guard = new TenantIsolationGuard('tn_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(() =>
      guard.assertPayloadTenant('tn_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', { operation: 'payload' })
    ).not.toThrow();
    expect(() =>
      guard.assertPayloadTenant('tn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', { operation: 'payload' })
    ).toThrow(TenantIsolationViolationError);
  });
});

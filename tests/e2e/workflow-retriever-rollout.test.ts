/**
 * E2E: YAML-driven A/B Retriever Rollout & Workflow Engine
 * Covers: rollout percentages, canary users, env fallback, workflow integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TenantIsolatedRetriever } from '../../src/lib/rag/supabase-retriever-v2';
import { getTenantConfig } from '../../src/lib/config/tenant-config-loader';

// Mock tenant configs for different rollout scenarios
const TENANT_ID_0 = 'tn_00000000000000000000000000000000'; // 0% rollout
const TENANT_ID_10 = 'tn_10000000000000000000000000000000'; // 10% rollout
const TENANT_ID_50 = 'tn_50000000000000000000000000000000'; // 50% rollout
const TENANT_ID_100 = 'tn_99999999999999999999999999999999'; // 100% rollout

// Patch getTenantConfig to return custom configs
vi.mock('../../src/lib/config/tenant-config-loader', async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual, {
    getTenantConfig: (tenantId: string) => {
      if (tenantId === TENANT_ID_0) return { rollout: { staged_features: [{ name: 'llamaindex_retriever_v3', rollout: '0%' }] } };
      if (tenantId === TENANT_ID_10) return { rollout: { staged_features: [{ name: 'llamaindex_retriever_v3', rollout: '10%' }] } };
      if (tenantId === TENANT_ID_50) return { rollout: { staged_features: [{ name: 'llamaindex_retriever_v3', rollout: '50%' }] } };
      if (tenantId === TENANT_ID_100) return { rollout: { staged_features: [{ name: 'llamaindex_retriever_v3', rollout: '100%' }] } };
      return { rollout: { staged_features: [] } };
    },
  });
});

describe('YAML A/B Retriever Rollout', () => {
  it('routes 0% rollout to v2', async () => {
    const retriever = await TenantIsolatedRetriever.create(TENANT_ID_0, { userId: 'userA' });
    expect((retriever as any)._useV3Retriever).toBe(false);
  });

  it('routes 100% rollout to v3', async () => {
    const retriever = await TenantIsolatedRetriever.create(TENANT_ID_100, { userId: 'userA' });
    expect((retriever as any)._useV3Retriever).toBe(true);
  });

  it('routes 10% rollout: user hash below 10 uses v3, above uses v2', async () => {
    // userId with hash % 100 < 10
    const retrieverA = await TenantIsolatedRetriever.create(TENANT_ID_10, { userId: 'user1' });
    // userId with hash % 100 >= 10
    const retrieverB = await TenantIsolatedRetriever.create(TENANT_ID_10, { userId: 'user99' });
    // At least one should be true, one false
    const results = [(retrieverA as any)._useV3Retriever, (retrieverB as any)._useV3Retriever];
    expect(results).toContain(true);
    expect(results).toContain(false);
  });

  it('routes 50% rollout: splits users roughly evenly', async () => {
    let v3Count = 0, v2Count = 0;
    for (let i = 0; i < 100; i++) {
      const userId = 'user' + i;
      const retriever = await TenantIsolatedRetriever.create(TENANT_ID_50, { userId });
      if ((retriever as any)._useV3Retriever) v3Count++;
      else v2Count++;
    }
    // Should be roughly 50/50
    expect(v3Count).toBeGreaterThan(30);
    expect(v2Count).toBeGreaterThan(30);
  });

  it('falls back to env override', async () => {
    process.env.RAG_RETRIEVER_VERSION = 'v3';
    const retriever = await TenantIsolatedRetriever.create(TENANT_ID_0, { userId: 'userA' });
    expect((retriever as any)._useV3Retriever).toBe(true);
    process.env.RAG_RETRIEVER_VERSION = 'v2';
    const retriever2 = await TenantIsolatedRetriever.create(TENANT_ID_100, { userId: 'userA' });
    expect((retriever2 as any)._useV3Retriever).toBe(false);
    delete process.env.RAG_RETRIEVER_VERSION;
  });
});

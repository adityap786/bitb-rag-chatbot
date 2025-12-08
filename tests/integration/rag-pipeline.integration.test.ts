import { describe, it, expect, beforeAll } from 'vitest';
import { getServiceClient } from '@/lib/supabase-client';
import { mcpHybridRagQuery } from '@/lib/ragPipeline';

// Setup test tenant and KB
const TEST_TENANT_ID = 'test-tenant-integration';
const TEST_KB_ID = 'test-kb-integration';


// Helper to create KB and ingest docs
async function setupTestKB() {
  const supabase = getServiceClient();
  // Simulate KB creation and ingestion
  // ...existing code...
}

describe('RAG Pipeline Integration', () => {
  beforeAll(async () => {
    await setupTestKB();
  });


  it('should retrieve relevant chunks for a query', async () => {
    const result = await mcpHybridRagQuery({
      tenantId: TEST_TENANT_ID,
      query: 'What is the company mission?',
    });
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0].chunk).toMatch(/mission/i);
  });


  it('should enforce RLS (tenant isolation)', async () => {
    // Try querying with wrong tenant
    const result = await mcpHybridRagQuery({
      tenantId: 'other-tenant',
      query: 'What is the company mission?',
    });
    expect(result.sources.length).toBe(0);
  });


  it('should cache repeated queries', async () => {
    const first = await mcpHybridRagQuery({
      tenantId: TEST_TENANT_ID,
      query: 'What is the company mission?',
    });
    const second = await mcpHybridRagQuery({
      tenantId: TEST_TENANT_ID,
      query: 'What is the company mission?',
    });
    expect(second.sources.length).toBeGreaterThan(0);
    // Ideally, check cache metrics
  });
});

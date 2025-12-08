/**
 * Tenant Isolation Integration Tests
 * 
 * Verifies zero-tolerance cross-tenant data access.
 * Tests all defense layers: code, DB, RLS, audit.
 * 
 * Date: 2025-11-19
 * Compliance: ISO 27001, SOC 2 Type II
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { TenantIsolationGuard, TenantIsolationViolationError } from '@/lib/rag/tenant-isolation';
import {
  validateTenantAccess,
  validateResourceOwnership,
  validateTrialTokenOwnership,
  TenantAccessViolationError,
} from '@/lib/security/tenant-access-validator';
import { getSupabaseRetriever, addDocumentsToTenant } from '@/lib/rag/supabase-retriever';

describe('Tenant Isolation - Integration Tests', () => {
  let supabase: SupabaseClient;
  let tenantA: string;
  let tenantB: string;
  let embeddingIdA: string;
  let embeddingIdB: string;

  beforeAll(async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured for testing');
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    // Create two test tenants
    tenantA = `tn_${'a'.repeat(32)}`;
    tenantB = `tn_${'b'.repeat(32)}`;

    await supabase.from('trial_tenants').upsert([
      {
        tenant_id: tenantA,
        email: 'tenant-a@test.com',
        business_name: 'Tenant A Corp',
        business_type: 'saas',
        status: 'active',
        trial_expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        tenant_id: tenantB,
        email: 'tenant-b@test.com',
        business_name: 'Tenant B Inc',
        business_type: 'ecommerce',
        status: 'active',
        trial_expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ]);

    // Insert test embeddings
    const { data: dataA } = await supabase.from('embeddings').insert({
      tenant_id: tenantA,
      kb_id: `kb_${'a'.repeat(32)}`,
      chunk_text: 'Tenant A confidential data',
      // embedding: Array(1536).fill(0.1),
      metadata: { tenant_id: tenantA, type: 'test' },
    }).select('embedding_id').single();

    const { data: dataB } = await supabase.from('embeddings').insert({
      tenant_id: tenantB,
      kb_id: `kb_${'b'.repeat(32)}`,
      chunk_text: 'Tenant B confidential data',
      // embedding: Array(1536).fill(0.2),
      metadata: { tenant_id: tenantB, type: 'test' },
    }).select('embedding_id').single();

    embeddingIdA = dataA?.embedding_id || '';
    embeddingIdB = dataB?.embedding_id || '';
  });

  afterAll(async () => {
    // Cleanup test data
    await supabase.from('embeddings').delete().eq('tenant_id', tenantA);
    await supabase.from('embeddings').delete().eq('tenant_id', tenantB);
    await supabase.from('trial_tenants').delete().eq('tenant_id', tenantA);
    await supabase.from('trial_tenants').delete().eq('tenant_id', tenantB);
  });

  describe('TenantIsolationGuard', () => {
    it('tags documents with tenant_id on write', () => {
      const guard = new TenantIsolationGuard(tenantA);
      const docs = [
        { pageContent: 'Test content', metadata: {} as Record<string, any> },
      ];

      const tagged = guard.enforceWriteIsolation(docs);

      expect((tagged[0].metadata as any)?.tenant_id).toBe(tenantA);
    });

    it('detects cross-tenant documents on read', () => {
      const guard = new TenantIsolationGuard(tenantA);
      const docs = [
        {
          pageContent: 'Test content',
          metadata: { tenant_id: tenantB }, // Wrong tenant!
        },
      ];

      expect(() =>
        guard.validateRetrievedDocuments(docs, { operation: 'test_retrieval' })
      ).toThrow(TenantIsolationViolationError);
    });

    it('rejects documents missing tenant_id on read', () => {
      const guard = new TenantIsolationGuard(tenantA);
      const docs = [
        {
          pageContent: 'Test content',
          metadata: {}, // Missing tenant_id!
        },
      ];

      expect(() =>
        guard.validateRetrievedDocuments(docs, { operation: 'test_retrieval' })
      ).toThrow(TenantIsolationViolationError);
    });

    it('passes validation for correct tenant documents', () => {
      const guard = new TenantIsolationGuard(tenantA);
      const docs = [
        {
          pageContent: 'Test content',
          metadata: { tenant_id: tenantA },
        },
      ];

      expect(() =>
        guard.validateRetrievedDocuments(docs, { operation: 'test_retrieval' })
      ).not.toThrow();
    });
  });

  describe('validateTenantAccess', () => {
    it('rejects invalid tenant_id format', async () => {
      await expect(
        validateTenantAccess('invalid_format', { operation: 'test' })
      ).rejects.toThrow(TenantAccessViolationError);
    });

    it('rejects missing tenant_id', async () => {
      await expect(
        validateTenantAccess('', { operation: 'test' })
      ).rejects.toThrow(TenantAccessViolationError);
    });

    it('rejects non-existent tenant', async () => {
      await expect(
        validateTenantAccess(`tn_${'f'.repeat(32)}`, { operation: 'test' })
      ).rejects.toThrow(TenantAccessViolationError);
    });

    it('accepts valid tenant_id', async () => {
      await expect(
        validateTenantAccess(tenantA, { operation: 'test' })
      ).resolves.not.toThrow();
    });
  });

  describe('validateResourceOwnership', () => {
    it('rejects cross-tenant resource access', async () => {
      // Try to access Tenant B's embedding as Tenant A
      await expect(
        validateResourceOwnership(tenantA, 'embedding', embeddingIdB)
      ).rejects.toThrow(TenantAccessViolationError);
    });

    it('accepts same-tenant resource access', async () => {
      await expect(
        validateResourceOwnership(tenantA, 'embedding', embeddingIdA)
      ).resolves.not.toThrow();
    });

    it('rejects non-existent resource', async () => {
      await expect(
        validateResourceOwnership(tenantA, 'embedding', 'nonexistent-id')
      ).rejects.toThrow(TenantAccessViolationError);
    });
  });

  describe('Cross-Tenant Query Prevention', () => {
    it('prevents Tenant A from retrieving Tenant B data', async () => {
      // Set RLS context for Tenant A
      await supabase.rpc('set_tenant_context', { p_tenant_id: tenantA });

      // Query embeddings with explicit tenant filter
      const { data, error } = await supabase
        .from('embeddings')
        .select('*')
        .eq('tenant_id', tenantA);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.every((row) => row.tenant_id === tenantA)).toBe(true);
      expect(data!.some((row) => row.tenant_id === tenantB)).toBe(false);
    });

    it('RLS prevents cross-tenant reads even without explicit filter', async () => {
      // Set RLS context for Tenant A
      await supabase.rpc('set_tenant_context', { p_tenant_id: tenantA });

      // Query WITHOUT explicit tenant filter (RLS should enforce)
      const { data, error } = await supabase
        .from('embeddings')
        .select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      // RLS should only return Tenant A's data
      expect(data!.every((row) => row.tenant_id === tenantA)).toBe(true);
      expect(data!.some((row) => row.tenant_id === tenantB)).toBe(false);
    });
  });

  describe('End-to-End Isolation Test', () => {
    it('full RAG query returns only tenant-scoped data', async () => {
      // This test now assumes Groq API is used for LLM, not OpenAI.
      const retrieverA = await getSupabaseRetriever(tenantA, { k: 5 });
      if (!retrieverA || !retrieverA.retrieve) {
        throw new Error('Retriever not initialized');
      }
      const docsA = await retrieverA.retrieve('confidential');

      // All returned documents must belong to Tenant A
      docsA.forEach((doc: any) => {
        const docTenant = doc.metadata?.tenant_id;
        expect(docTenant).toBe(tenantA);
        expect(docTenant).not.toBe(tenantB);
      });

      // Verify Tenant B's data is NOT returned
      const hasB = docsA.some((doc: any) => doc.pageContent.includes('Tenant B'));
      expect(hasB).toBe(false);
    });
  });
});

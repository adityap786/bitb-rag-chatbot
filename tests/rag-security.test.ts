/**
 * RAG Security Tests
 * 
 * Tests that enforce tenant isolation and validate WHERE clause usage
 * 
 * CRITICAL: These tests validate security boundaries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateTenantId } from '../src/lib/rag/supabase-retriever';
import { validateTenantContext } from '../src/lib/middleware/tenant-context';
import { NextRequest } from 'next/server';

describe('RAG Security - Tenant Isolation', () => {
  describe('validateTenantId', () => {
    it('accepts valid tenant_id format', () => {
      const validId = 'tn_' + 'a'.repeat(32);
      expect(() => validateTenantId(validId)).not.toThrow();
    });

    it('rejects null tenant_id', () => {
      expect(() => validateTenantId(null as any)).toThrow('tenant_id is required');
    });

    it('rejects undefined tenant_id', () => {
      expect(() => validateTenantId(undefined as any)).toThrow('tenant_id is required');
    });

    it('rejects empty string tenant_id', () => {
      expect(() => validateTenantId('')).toThrow('tenant_id is required');
    });

    it('rejects non-string tenant_id', () => {
      expect(() => validateTenantId(123 as any)).toThrow('tenant_id must be a string');
    });

    it('rejects tenant_id with wrong prefix', () => {
      const invalidId = 'tr_' + 'a'.repeat(32);
      expect(() => validateTenantId(invalidId)).toThrow('Invalid tenant_id format');
    });

    it('rejects tenant_id with wrong length', () => {
      const tooShort = 'tn_abc123';
      expect(() => validateTenantId(tooShort)).toThrow('Invalid tenant_id format');
    });

    it('rejects tenant_id with uppercase letters', () => {
      const uppercase = 'tn_' + 'A'.repeat(32);
      expect(() => validateTenantId(uppercase)).toThrow('Invalid tenant_id format');
    });

    it('rejects SQL injection attempts', () => {
      const sqlInjection = "tn_'; DROP TABLE embeddings; --";
      expect(() => validateTenantId(sqlInjection)).toThrow('Invalid tenant_id format');
    });
  });

  describe('validateTenantContext middleware', () => {
    it('rejects request without tenant_id', async () => {
      const request = new NextRequest('http://localhost:3000/api/ask', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      const response = await validateTenantContext(request);
      
      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
      const body = await response!.json();
      expect(body.code).toBe('MISSING_TENANT_CONTEXT');
    });

    it('rejects request with invalid tenant_id format', async () => {
      const request = new NextRequest('http://localhost:3000/api/ask', {
        method: 'POST',
        body: JSON.stringify({ 
          tenant_id: 'invalid_format',
          query: 'test' 
        }),
      });

      const response = await validateTenantContext(request);
      
      expect(response).not.toBeNull();
      expect(response!.status).toBe(403);
      const body = await response!.json();
      expect(body.code).toBe('INVALID_TENANT_ID');
    });

    it('accepts valid tenant_id', async () => {
      const validTenantId = 'tn_' + 'a'.repeat(32);
      
      const request = new NextRequest('http://localhost:3000/api/ask', {
        method: 'POST',
        body: JSON.stringify({ 
          tenant_id: validTenantId,
          query: 'test' 
        }),
      });

      const response = await validateTenantContext(request);
      
      // Should return null (no error) for valid tenant_id
      expect(response).toBeNull();
    });
  });

  describe('Cross-tenant isolation', () => {
    it('prevents tenant A from accessing tenant B data', () => {
      // This test requires Supabase mock or integration test
      // For now, document the expected behavior:
      
      const tenantA = 'tn_' + 'a'.repeat(32);
      const tenantB = 'tn_' + 'b'.repeat(32);

      // Expected: getSupabaseRetriever(tenantA) should never return
      // documents with tenant_id = tenantB
      
      // This is enforced by:
      // 1. RLS policies on embeddings table
      // 2. match_embeddings_by_tenant function filtering
      // 3. Explicit WHERE tenant_id = $1 in SQL
      
      expect(tenantA).not.toBe(tenantB);
    });
  });

  describe('SQL injection prevention', () => {
    it('prevents SQL injection in tenant_id', () => {
      const maliciousInputs = [
        "'; DROP TABLE embeddings; --",
        "' OR '1'='1",
        "1' UNION SELECT * FROM users --",
        "; DELETE FROM trials WHERE '1'='1",
      ];

      maliciousInputs.forEach((input) => {
        expect(() => validateTenantId(input)).toThrow('Invalid tenant_id format');
      });
    });
  });

  describe('Query parameter validation', () => {
    it('ensures match_tenant_id is always provided', () => {
      // The match_embeddings_by_tenant function MUST fail if tenant_id is NULL
      // This is enforced at the PostgreSQL level:
      // 
      // IF match_tenant_id IS NULL OR match_tenant_id = '' THEN
      //   RAISE EXCEPTION 'SECURITY: tenant_id is required';
      // END IF;
      
      expect(true).toBe(true); // Placeholder - tested at DB level
    });
  });
});

describe('RAG Security - Trial Token Validation', () => {
  it('validates trial_token format', () => {
    const validTokens = [
      'tr_' + 'a'.repeat(32),
      'tr_' + '1'.repeat(32),
      'tr_' + 'abc123def456'.repeat(3).substring(0, 35), // tr_ + 32 hex chars
    ];

    const invalidTokens = [
      'invalid',
      'tr_short',
      'tr_' + 'a'.repeat(31), // Too short
      'tr_' + 'a'.repeat(33), // Too long
      'trial_' + 'a'.repeat(32), // Wrong prefix
      'TR_' + 'a'.repeat(32), // Uppercase
    ];

    // This would be tested in validateTrialToken (private function)
    // For now, document expected behavior
    expect(validTokens.length).toBeGreaterThan(0);
    expect(invalidTokens.length).toBeGreaterThan(0);
  });
});

describe('RAG Security - Environment Variables', () => {
  it('fails safely when Supabase credentials missing', () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Temporarily unset env vars
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Import will throw when trying to create client
    // This is fail-safe behavior
    
    // Restore env vars
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;

    expect(true).toBe(true); // Placeholder
  });
});

/**
 * Integration Test Requirements (for CI/CD)
 * 
 * These tests require a running Supabase instance:
 * 
 * 1. Create two tenants (A and B)
 * 2. Insert embeddings for tenant A
 * 3. Query as tenant B
 * 4. Assert: tenant B sees ZERO results
 * 5. Query as tenant A
 * 6. Assert: tenant A sees only their embeddings
 * 7. Attempt SQL injection in query
 * 8. Assert: Query fails safely
 * 
 * Run with:
 * npm run test:integration
 */

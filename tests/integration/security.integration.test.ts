import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@/lib/security/rate-limiting';
import { getRateLimitIdentifier, RATE_LIMITS } from '@/lib/security/rate-limiting';

const TEST_TENANT_ID = 'security-tenant-integration';

describe('Security Integration', () => {
  it('should enforce rate limits for tenant', async () => {
    const identifier = getRateLimitIdentifier({ headers: new Map() } as any, 'tenant', { tenant_id: TEST_TENANT_ID });
    for (let i = 0; i < RATE_LIMITS.TRIAL_QUERIES.max_requests; i++) {
      const result = await checkRateLimit(identifier, RATE_LIMITS.TRIAL_QUERIES);
      expect(result.allowed).toBe(true);
    }
    // Next request should be denied
    const result = await checkRateLimit(identifier, RATE_LIMITS.TRIAL_QUERIES);
    expect(result.allowed).toBe(false);
  });

  it('should enforce rate limits for IP', async () => {
    const identifier = getRateLimitIdentifier({ headers: new Map([['x-forwarded-for', '1.2.3.4']]) } as any, 'ip');
    for (let i = 0; i < RATE_LIMITS.GENERAL_API.max_requests; i++) {
      const result = await checkRateLimit(identifier, RATE_LIMITS.GENERAL_API);
      expect(result.allowed).toBe(true);
    }
    const result = await checkRateLimit(identifier, RATE_LIMITS.GENERAL_API);
    expect(result.allowed).toBe(false);
  });
});

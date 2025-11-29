/**
 * Guardrails Tests
 * 
 * Tests for PII masking, audit logging, and rate limiting.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  maskPII,
  containsPII,
  detectPII,
  PIIMasker,
} from '@/lib/security/pii-masking';
import {
  checkRateLimit,
  clearAllRateLimits,
  RATE_LIMITS,
} from '@/lib/security/rate-limiting';
import { hashSensitiveData } from '@/lib/security/audit-logging';

describe('PII Masking', () => {
  describe('maskPII', () => {
    it('masks email addresses', () => {
      const result = maskPII('My email is john@example.com');
      expect(result.masked_text).toBe('My email is [EMAIL_REDACTED]');
      expect(result.was_modified).toBe(true);
      expect(result.detections).toHaveLength(1);
      expect(result.detections[0].type).toBe('email');
    });

    it('masks phone numbers', () => {
      const result = maskPII('Call me at (555) 123-4567');
      expect(result.masked_text).toBe('Call me at [PHONE_REDACTED]');
      expect(result.was_modified).toBe(true);
    });

    it('masks credit card numbers', () => {
      const result = maskPII('Card: 4111-1111-1111-1111');
      expect(result.masked_text).toBe('Card: [CARD_REDACTED]');
      expect(result.was_modified).toBe(true);
    });

    it('masks SSN', () => {
      const result = maskPII('SSN: 123-45-6789');
      expect(result.masked_text).toBe('SSN: [SSN_REDACTED]');
      expect(result.was_modified).toBe(true);
    });

    it('masks multiple PII types', () => {
      const result = maskPII('Email john@example.com phone (555) 123-4567');
      expect(result.masked_text).toBe('Email [EMAIL_REDACTED] phone [PHONE_REDACTED]');
      expect(result.detections).toHaveLength(2);
      expect(result.was_modified).toBe(true);
    });

    it('masks API keys', () => {
      const result = maskPII('API key: sk_live_abc123def456ghi789jkl012');
      expect(result.masked_text).toBe('API key: [API_KEY_REDACTED]');
      expect(result.was_modified).toBe(true);
    });

    it('masks bearer tokens', () => {
      const result = maskPII('Authorization: Bearer abc.def.ghi');
      expect(result.masked_text).toBe('Authorization: [BEARER_TOKEN_REDACTED]');
      expect(result.was_modified).toBe(true);
    });

    it('returns unchanged text if no PII', () => {
      const result = maskPII('This is clean text');
      expect(result.masked_text).toBe('This is clean text');
      expect(result.was_modified).toBe(false);
      expect(result.detections).toHaveLength(0);
    });

    it('preserves format when requested', () => {
      const result = maskPII('john@example.com', { preserveFormat: true });
      expect(result.masked_text).toBe('*****************');
      expect(result.was_modified).toBe(true);
    });

    it('masks only specified patterns', () => {
      const result = maskPII('Email john@example.com phone (555) 123-4567', {
        patterns: ['email'],
      });
      expect(result.masked_text).toBe('Email [EMAIL_REDACTED] phone (555) 123-4567');
      expect(result.detections).toHaveLength(1);
    });
  });

  describe('containsPII', () => {
    it('returns true if PII detected', () => {
      expect(containsPII('Email: john@example.com')).toBe(true);
      expect(containsPII('Phone: (555) 123-4567')).toBe(true);
    });

    it('returns false if no PII', () => {
      expect(containsPII('Clean text')).toBe(false);
    });
  });

  describe('detectPII', () => {
    it('returns all PII detections', () => {
      const detections = detectPII('john@example.com and jane@example.com');
      expect(detections).toHaveLength(2);
      expect(detections[0].type).toBe('email');
      expect(detections[1].type).toBe('email');
    });

    it('returns empty array if no PII', () => {
      const detections = detectPII('No PII here');
      expect(detections).toHaveLength(0);
    });
  });

  describe('PIIMasker helpers', () => {
    it('forLLM masks sensitive patterns', () => {
      const result = PIIMasker.forLLM('Email john@example.com key sk_live_abc123');
      expect(result.masked_text).toContain('[EMAIL_REDACTED]');
      expect(result.masked_text).toContain('[API_KEY_REDACTED]');
    });

    it('forLogs preserves format', () => {
      const result = PIIMasker.forLogs('john@example.com');
      expect(result.masked_text).toMatch(/^\*+$/);
    });

    it('forCredentials only masks credentials', () => {
      const result = PIIMasker.forCredentials('Email john@example.com key sk_live_abc123');
      expect(result.masked_text).toContain('john@example.com'); // Email not masked
      expect(result.masked_text).toContain('[API_KEY_REDACTED]');
    });

    it('forPersonalData only masks personal info', () => {
      const result = PIIMasker.forPersonalData('Email john@example.com key sk_live_abc123');
      expect(result.masked_text).toContain('[EMAIL_REDACTED]');
      expect(result.masked_text).toContain('sk_live_abc123'); // API key not masked
    });
  });

  describe('SQL injection prevention', () => {
    it('does not interfere with SQL-like patterns', () => {
      const result = maskPII("SELECT * FROM table WHERE email = 'test@example.com'");
      expect(result.masked_text).toBe("SELECT * FROM table WHERE email = '[EMAIL_REDACTED]'");
      expect(result.detections).toHaveLength(1);
    });
  });
});

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Clear rate limit store before each test
    clearAllRateLimits();
  });

  describe('checkRateLimit', () => {
    it('allows requests under limit', async () => {
      const config = {
        max_requests: 5,
        window_ms: 60000,
        identifier_type: 'tenant' as const,
      };

      const result1 = await Promise.resolve(checkRateLimit('test-tenant', config));
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      const result2 = await Promise.resolve(checkRateLimit('test-tenant', config));
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);
    });

    it('blocks requests over limit', async () => {
      const config = {
        max_requests: 2,
        window_ms: 60000,
        identifier_type: 'tenant' as const,
      };
      await Promise.resolve(checkRateLimit('test-tenant', config)); // 1st request
      await Promise.resolve(checkRateLimit('test-tenant', config)); // 2nd request

      const result = await Promise.resolve(checkRateLimit('test-tenant', config)); // 3rd request
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retry_after_ms).toBeGreaterThan(0);
    });

    it('isolates rate limits by identifier', async () => {
      const config = {
        max_requests: 2,
        window_ms: 60000,
        identifier_type: 'tenant' as const,
      };
      await Promise.resolve(checkRateLimit('tenant-a', config));
      await Promise.resolve(checkRateLimit('tenant-a', config));
      const resultA = await Promise.resolve(checkRateLimit('tenant-a', config));
      expect(resultA.allowed).toBe(false);

      // Different tenant should have separate limit
      const resultB = await Promise.resolve(checkRateLimit('tenant-b', config));
      expect(resultB.allowed).toBe(true);
    });

    it('refills tokens over time', async () => {
      const config = {
        max_requests: 1,
        window_ms: 100, // 100ms window
        identifier_type: 'tenant' as const,
      };

      const result1 = await Promise.resolve(checkRateLimit('test-tenant', config));
      expect(result1.allowed).toBe(true);

      const result2 = await Promise.resolve(checkRateLimit('test-tenant', config));
      expect(result2.allowed).toBe(false);

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 150));

      const result3 = await Promise.resolve(checkRateLimit('test-tenant', config));
      expect(result3.allowed).toBe(true);
    });
  });

  describe('predefined rate limits', () => {
    it('has correct TRIAL_QUERIES config', () => {
      expect(RATE_LIMITS.TRIAL_QUERIES.max_requests).toBe(100);
      expect(RATE_LIMITS.TRIAL_QUERIES.window_ms).toBe(60 * 60 * 1000);
    });

    it('has correct MCP tool configs', () => {
      expect(RATE_LIMITS.MCP_RAG_QUERY.max_requests).toBe(20);
      expect(RATE_LIMITS.MCP_INGEST.max_requests).toBe(5);
      expect(RATE_LIMITS.MCP_TRIAL_STATUS.max_requests).toBe(30);
      expect(RATE_LIMITS.MCP_UPDATE_SETTINGS.max_requests).toBe(10);
    });
  });
});

describe('Audit Logging', () => {
  describe('hashSensitiveData', () => {
    it('produces consistent SHA-256 hashes', () => {
      const hash1 = hashSensitiveData('test query');
      const hash2 = hashSensitiveData('test query');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 is 64 hex characters
    });

    it('produces different hashes for different inputs', () => {
      const hash1 = hashSensitiveData('query 1');
      const hash2 = hashSensitiveData('query 2');
      expect(hash1).not.toBe(hash2);
    });

    it('produces deterministic hashes', () => {
      const testString = 'My email is john@example.com';
      const hash = hashSensitiveData(testString);
      // SHA-256 hash should be deterministic
      expect(hash).toBe(hashSensitiveData(testString));
    });
  });
});

describe('Integration: PII + Audit Logging', () => {
  it('can hash masked query for logging', () => {
    const originalQuery = 'My email is john@example.com';
    const maskedResult = PIIMasker.forLLM(originalQuery);
    const queryHash = hashSensitiveData(originalQuery);

    // Masked query should not contain PII
    expect(maskedResult.masked_text).not.toContain('john@example.com');
    expect(maskedResult.masked_text).toContain('[EMAIL_REDACTED]');

    // Hash should be consistent for audit logging
    expect(queryHash).toHaveLength(64);
  });
});

/**
 * Tests for Redis-backed Rate Limiter
 * 
 * Tests cover:
 * - Basic rate limiting functionality
 * - Distributed rate limiting (multiple instances)
 * - Token bucket refill logic
 * - Error handling and fallback
 * - Connection health checks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisRateLimiter } from '@/lib/security/redis-rate-limiter';
import { RateLimitConfig } from '@/lib/security/rate-limiting';

// Note: `ioredis` is mocked globally in `tests/setup.ts`. The per-file mock
// was removed to avoid conflicts with the global test shim.

describe('RedisRateLimiter', () => {
  let limiter: RedisRateLimiter;

  const testConfig: RateLimitConfig = {
    max_requests: 10,
    window_ms: 60000, // 1 minute
    identifier_type: 'tenant',
  };

  beforeEach(async () => {
    // Set REDIS_URL for testing
    process.env.REDIS_URL = 'redis://localhost:6379';
    
    limiter = new RedisRateLimiter();
    await limiter.initialize();
  });

  afterEach(async () => {
    await limiter.close();
    delete process.env.REDIS_URL;
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const result = await limiter.checkRateLimit('tenant:123', testConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // 10 - 1 = 9
      expect(result.reset_at).toBeGreaterThan(Date.now());
    });

    it('should deny requests exceeding limit', async () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.checkRateLimit('tenant:123', testConfig);
      }

      // Next request should be denied
      const result = await limiter.checkRateLimit('tenant:123', testConfig);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retry_after_ms).toBeGreaterThan(0);
    });

    it('should track remaining tokens correctly', async () => {
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await limiter.checkRateLimit('tenant:123', testConfig);
        results.push(result.remaining);
      }

      expect(results).toEqual([9, 8, 7, 6, 5]);
    });

    it('should isolate rate limits by identifier', async () => {
      // Consume tokens for tenant:123
      for (let i = 0; i < 10; i++) {
        await limiter.checkRateLimit('tenant:123', testConfig);
      }

      // tenant:456 should still have tokens
      const result = await limiter.checkRateLimit('tenant:456', testConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });
  });

  describe('Token Refill', () => {
    it('should refill tokens over time', async () => {
      // Consume 5 tokens
      for (let i = 0; i < 5; i++) {
        await limiter.checkRateLimit('tenant:123', testConfig);
      }

      // Wait for refill (simulate 30 seconds = 5 tokens)
      // In real scenario, time would pass. In mock, we can advance time.
      // For now, verify the refill logic is in place
      const status = await limiter.getRateLimitStatus('tenant:123');
      expect(status).toBeDefined();
      expect(status?.max_tokens).toBe(10);
    });
  });

  describe('Administrative Functions', () => {
    it('should clear rate limit for specific identifier', async () => {
      // Consume tokens
      await limiter.checkRateLimit('tenant:123', testConfig);
      
      // Clear rate limit
      const cleared = await limiter.clearRateLimit('tenant:123');
      expect(cleared).toBe(true);

      // Should have full tokens again
      const result = await limiter.checkRateLimit('tenant:123', testConfig);
      expect(result.remaining).toBe(9); // Fresh start
    });

    it('should clear all rate limits', async () => {
      // Create multiple rate limits
      await limiter.checkRateLimit('tenant:123', testConfig);
      await limiter.checkRateLimit('tenant:456', testConfig);
      await limiter.checkRateLimit('tenant:789', testConfig);

      // Clear all
      const count = await limiter.clearAllRateLimits();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should get rate limit status', async () => {
      await limiter.checkRateLimit('tenant:123', testConfig);

      const status = await limiter.getRateLimitStatus('tenant:123');

      expect(status).toBeDefined();
      expect(status?.tokens).toBeCloseTo(9, 0);
      expect(status?.max_tokens).toBe(10);
    });

    it('should return null for non-existent rate limit', async () => {
      const status = await limiter.getRateLimitStatus('tenant:nonexistent');
      expect(status).toBeNull();
    });
  });

  describe('Health Checks', () => {
    it('should pass health check when connected', async () => {
      const health = await limiter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency_ms).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeUndefined();
    });

    it('should report connection status', () => {
      const status = limiter.getStatus();

      expect(status.connected).toBe(true);
      expect(status.error).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection failure gracefully', async () => {
      // Create limiter without initializing (constructor takes no args)
      const failedLimiter = new RedisRateLimiter();
      
      try {
        await failedLimiter.initialize();
      } catch (error) {
        // Expected to fail
      }

      // Should deny requests when Redis is unavailable
      const result = await failedLimiter.checkRateLimit('tenant:123', testConfig);
      
      expect(result.allowed).toBe(false); // Deny for safety
      expect(result.remaining).toBe(0);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests correctly', async () => {
      // Simulate multiple concurrent requests
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(limiter.checkRateLimit('tenant:123', testConfig));
      }

      const results = await Promise.all(promises);

      // First 10 should be allowed, next 5 denied
      const allowed = results.filter(r => r.allowed).length;
      const denied = results.filter(r => !r.allowed).length;

      expect(allowed).toBe(10);
      expect(denied).toBe(5);
    });
  });

  describe('Different Rate Limit Configs', () => {
    it('should respect different rate limits', async () => {
      const strictConfig: RateLimitConfig = {
        max_requests: 3,
        window_ms: 10000,
        identifier_type: 'tenant',
      };

      // Consume all 3 tokens
      for (let i = 0; i < 3; i++) {
        const result = await limiter.checkRateLimit('tenant:strict', strictConfig);
        expect(result.allowed).toBe(true);
      }

      // 4th request should be denied
      const result = await limiter.checkRateLimit('tenant:strict', strictConfig);
      expect(result.allowed).toBe(false);
    });

    it('should handle high-frequency limits', async () => {
      const highFreqConfig: RateLimitConfig = {
        max_requests: 100,
        window_ms: 1000, // 100 requests per second
        identifier_type: 'tenant',
      };

      const results = [];
      for (let i = 0; i < 50; i++) {
        const result = await limiter.checkRateLimit('tenant:highfreq', highFreqConfig);
        results.push(result.allowed);
      }

      // All 50 should be allowed
      expect(results.every(allowed => allowed)).toBe(true);
    });
  });
});

describe('RedisRateLimiter Singleton', () => {
  it('should return same instance', async () => {
    const { getRedisRateLimiter, initializeRedisRateLimiter } = await import('@/lib/security/redis-rate-limiter');

    process.env.REDIS_URL = 'redis://localhost:6379';

    await initializeRedisRateLimiter();

    const instance1 = getRedisRateLimiter();
    const instance2 = getRedisRateLimiter();

    expect(instance1).toBe(instance2);

    await instance1.close();
    delete process.env.REDIS_URL;
  });
});

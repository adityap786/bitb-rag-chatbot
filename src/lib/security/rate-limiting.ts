/**
 * Rate Limiting Middleware
 * 
 * Token bucket algorithm for rate limiting API requests.
 * Supports per-tenant, per-tool, and per-IP rate limits.
 * 
 * Storage options:
 * - Redis (production, multi-server) - primary
 * - In-memory (development, fallback)
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditLogger } from './audit-logging';
import { getRedisRateLimiter } from './redis-rate-limiter';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  max_requests: number; // Maximum requests
  window_ms: number; // Time window in milliseconds
  identifier_type: 'tenant' | 'ip' | 'tenant+tool';
}

/**
 * Token bucket for rate limiting
 */
interface TokenBucket {
  tokens: number; // Available tokens
  last_refill: number; // Timestamp of last refill
  max_tokens: number; // Maximum tokens
  refill_rate: number; // Tokens per millisecond
}

/**
 * In-memory rate limit store (fallback only)
 * Used when Redis is unavailable
 */
const rateLimitStore = new Map<string, TokenBucket>();

/**
 * Configuration for rate limiter backend
 *
 * Notes:
 * - In production we use Redis when `REDIS_URL` is present.
 * - For test runs we also allow Redis when `REDIS_URL` is present so that
 *   tests which mock `ioredis` can exercise the Redis-backed code path.
 * - An override `TEST_USE_REDIS=1` can force Redis behavior in non-production
 *   environments for CI or local debugging.
 */
const USE_REDIS = Boolean(
  process.env.REDIS_URL &&
    (process.env.NODE_ENV === 'production' || process.env.TEST_USE_REDIS === '1')
);

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMITS = {
  // Trial users: 100 queries per hour
  TRIAL_QUERIES: {
    max_requests: 100,
    window_ms: 60 * 60 * 1000, // 1 hour
    identifier_type: 'tenant' as const,
  },

  // Document ingestion: 50 per hour
  INGESTION: {
    max_requests: 50,
    window_ms: 60 * 60 * 1000,
    identifier_type: 'tenant' as const,
  },

  // MCP rag_query: 20 per minute
  MCP_RAG_QUERY: {
    max_requests: 20,
    window_ms: 60 * 1000, // 1 minute
    identifier_type: 'tenant+tool' as const,
  },

  // MCP ingest_documents: 5 per minute
  MCP_INGEST: {
    max_requests: 5,
    window_ms: 60 * 1000,
    identifier_type: 'tenant+tool' as const,
  },

  // MCP get_trial_status: 30 per minute
  MCP_TRIAL_STATUS: {
    max_requests: 30,
    window_ms: 60 * 1000,
    identifier_type: 'tenant+tool' as const,
  },

  // MCP update_settings: 10 per minute
  MCP_UPDATE_SETTINGS: {
    max_requests: 10,
    window_ms: 60 * 1000,
    identifier_type: 'tenant+tool' as const,
  },

  // General API: 1000 per hour per IP (anti-abuse)
  GENERAL_API: {
    max_requests: 1000,
    window_ms: 60 * 60 * 1000,
    identifier_type: 'ip' as const,
  },
};

/**
 * Validate rate limit configuration
 */
export function validateRateLimitConfig(config: { maxRequests: number; windowMs: number }): void {
  if (config.maxRequests <= 0) {
    throw new Error('maxRequests must be positive');
  }
  if (config.windowMs <= 0) {
    throw new Error('windowMs must be positive');
  }
  if (!Number.isFinite(config.maxRequests) || !Number.isFinite(config.windowMs)) {
    throw new Error('Rate limit values must be finite numbers');
  }
}

/**
 * Get or create token bucket for identifier
 */
function getTokenBucket(identifier: string, config: RateLimitConfig): TokenBucket {
  let bucket = rateLimitStore.get(identifier);

  if (!bucket) {
    // Create new bucket
    bucket = {
      tokens: config.max_requests,
      last_refill: Date.now(),
      max_tokens: config.max_requests,
      refill_rate: config.max_requests / config.window_ms,
    };
    rateLimitStore.set(identifier, bucket);
  }

  return bucket;
}

/**
 * Refill tokens based on elapsed time
 */
function refillTokens(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.last_refill;
  const tokensToAdd = elapsed * bucket.refill_rate;

  bucket.tokens = Math.min(bucket.max_tokens, bucket.tokens + tokensToAdd);
  bucket.last_refill = now;
}

/**
 * Check if request is allowed under rate limit (in-memory implementation)
 */
function checkRateLimitInMemory(
  identifier: string,
  config: RateLimitConfig
): {
  allowed: boolean;
  remaining: number;
  reset_at: number; // Timestamp when limit resets
  retry_after_ms?: number; // Milliseconds to wait if rate limited
} {
  const bucket = getTokenBucket(identifier, config);
  refillTokens(bucket);

  const allowed = bucket.tokens >= 1;

  if (allowed) {
    bucket.tokens -= 1;
  }

  const reset_at = Date.now() + (config.window_ms - ((Date.now() - bucket.last_refill) % config.window_ms));
  const retry_after_ms = allowed ? undefined : Math.ceil((1 - bucket.tokens) / bucket.refill_rate);

  return {
    allowed,
    remaining: Math.floor(bucket.tokens),
    reset_at,
    retry_after_ms,
  };
}

/**
 * Check if request is allowed under rate limit
 * Uses Redis in production, falls back to in-memory
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
):
  | {
      allowed: boolean;
      remaining: number;
      reset_at: number;
      retry_after_ms?: number;
    }
  | Promise<{
      allowed: boolean;
      remaining: number;
      reset_at: number;
      retry_after_ms?: number;
    }> {
  // Use Redis in production if available (async path)
  if (USE_REDIS) {
    try {
      const limiter = getRedisRateLimiter();
      const status = limiter.getStatus();

      if (status.connected) {
        return limiter.checkRateLimit(identifier, config);
      } else {
        console.warn('[RateLimiting] Redis not connected, falling back to in-memory');
      }
    } catch (error) {
      console.error('[RateLimiting] Redis error, falling back to in-memory:', error);
    }
  }

  // Fallback to in-memory (synchronous)
  return checkRateLimitInMemory(identifier, config);
}

/**
 * Rate limit middleware
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  config: RateLimitConfig,
  identifier: string
): Promise<NextResponse | null> {
  const result = await checkRateLimit(identifier, config);

  if (!result.allowed) {
    // Extract tenant_id for audit logging (if available)
    const body = await request.clone().json().catch(() => ({}));
    const tenant_id = body.tenant_id || 'unknown';

    // Log rate limit exceeded
    await AuditLogger.logRateLimitExceeded(tenant_id, {
      limit_type: config.identifier_type,
      current_count: config.max_requests,
      limit: config.max_requests,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Maximum ${config.max_requests} requests per ${config.window_ms / 1000}s.`,
          details: {
            limit: config.max_requests,
            window_seconds: config.window_ms / 1000,
            retry_after_seconds: Math.ceil((result.retry_after_ms || 0) / 1000),
            reset_at: new Date(result.reset_at).toISOString(),
          },
        },
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': config.max_requests.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': new Date(result.reset_at).toISOString(),
          'Retry-After': Math.ceil((result.retry_after_ms || 0) / 1000).toString(),
        },
      }
    );
  }

  // Add rate limit headers to response (informational)
  return null; // No rate limit exceeded, continue
}

/**
 * Get identifier for rate limiting
 */
export function getRateLimitIdentifier(
  request: NextRequest,
  type: 'tenant' | 'ip' | 'tenant+tool',
  options?: {
    tenant_id?: string;
    tool_name?: string;
  }
): string {
  switch (type) {
    case 'tenant':
      return `tenant:${options?.tenant_id || 'unknown'}`;
    
    case 'ip':
      const ip = request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown';
      return `ip:${ip.split(',')[0].trim()}`;
    
    case 'tenant+tool':
      return `tenant:${options?.tenant_id || 'unknown'}:tool:${options?.tool_name || 'unknown'}`;
    
    default:
      return 'unknown';
  }
}

/**
 * Clear rate limit for identifier (admin/testing only)
 */
export function clearRateLimit(identifier: string): boolean {
  return rateLimitStore.delete(identifier);
}

/**
 * Get current rate limit status (for debugging)
 */
export function getRateLimitStatus(identifier: string): TokenBucket | null {
  return rateLimitStore.get(identifier) || null;
}

/**
 * Clear all rate limits (testing only)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Example usage:
 * 
 * // In API route
 * export async function POST(request: NextRequest) {
 *   const body = await request.json();
 *   const { tenant_id } = body;
 * 
 *   // Check rate limit
 *   const identifier = getRateLimitIdentifier(request, 'tenant', { tenant_id });
 *   const rateLimitResponse = await rateLimitMiddleware(
 *     request,
 *     RATE_LIMITS.TRIAL_QUERIES,
 *     identifier
 *   );
 * 
 *   if (rateLimitResponse) {
 *     return rateLimitResponse; // Rate limited
 *   }
 * 
 *   // Continue with request...
 * }
 */

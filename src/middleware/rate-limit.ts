/**
 * Rate Limiting Middleware
 * 
 * Provides Redis-based rate limiting for API routes with multiple strategies:
 * - Sliding window (precise, recommended)
 * - Fixed window (simpler, less precise)
 * - Token bucket (for burst traffic)
 * 
 * Usage:
 * ```typescript
 * import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';
 * 
 * export async function POST(req: Request) {
 *   const rateLimitResponse = await rateLimit(req, RATE_LIMITS.booking);
 *   if (rateLimitResponse) return rateLimitResponse;
 *   
 *   // Continue with request
 * }
 * ```
 */

import Redis from 'ioredis';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Redis client
let redis: InstanceType<typeof Redis> | null = null;

function getRedisClient(): InstanceType<typeof Redis> {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
    
    if (!redisUrl) {
      throw new Error('REDIS_URL or UPSTASH_REDIS_URL environment variable is required');
    }
    
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: false,
      lazyConnect: true
    });
    
    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
    
    redis.on('connect', () => {
      console.log('Redis connected successfully');
    });
  }
  
  return redis;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
  strategy?: 'sliding' | 'fixed' | 'token-bucket';
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * Get identifier for rate limiting
 * Priority: user ID > API key > IP address
 */
function getIdentifier(req: NextRequest | Request): string {
  // Try user ID from header
  const userId = req.headers.get('x-user-id');
  if (userId) return `user:${userId}`;
  
  // Try API key
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) return `api:${apiKey.substring(0, 10)}`; // Use prefix only
  
  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  
  return `ip:${ip}`;
}

/**
 * Sliding window rate limiting (most accurate)
 * Uses sorted sets to track requests in a time window
 */
async function slidingWindowRateLimit(
  redis: InstanceType<typeof Redis>,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;
  
  try {
    // Remove old entries
    await redis.zremrangebyscore(key, 0, windowStart);
    
    // Count current requests in window
    const count = await redis.zcard(key);
    
    if (count >= config.maxRequests) {
      // Get oldest request timestamp for retry-after
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTimestamp = oldest.length > 1 ? parseInt(oldest[1]) : now;
      const retryAfter = Math.ceil((oldestTimestamp + config.windowSeconds * 1000 - now) / 1000);
      
      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        reset: oldestTimestamp + config.windowSeconds * 1000,
        retryAfter: Math.max(retryAfter, 1)
      };
    }
    
    // Add current request
    const requestId = `${now}:${Math.random()}`;
    await redis.zadd(key, now, requestId);
    await redis.expire(key, config.windowSeconds);
    
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - (count + 1),
      reset: now + config.windowSeconds * 1000
    };
  } catch (error) {
    console.error('Sliding window rate limit error:', error);
    // Fail open (allow request on error)
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: now + config.windowSeconds * 1000
    };
  }
}

/**
 * Fixed window rate limiting (simpler, less accurate)
 * Uses incrementing counter with TTL
 */
async function fixedWindowRateLimit(
  redis: InstanceType<typeof Redis>,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  
  try {
    // Increment counter
    const current = await redis.incr(key);
    
    // Set expiration on first request
    if (current === 1) {
      await redis.expire(key, config.windowSeconds);
    }
    
    const ttl = await redis.ttl(key);
    const resetTime = now + ttl * 1000;
    
    if (current > config.maxRequests) {
      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        reset: resetTime,
        retryAfter: ttl
      };
    }
    
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - current,
      reset: resetTime
    };
  } catch (error) {
    console.error('Fixed window rate limit error:', error);
    // Fail open
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: now + config.windowSeconds * 1000
    };
  }
}

/**
 * Token bucket rate limiting (allows bursts)
 * Good for APIs that need to handle occasional spikes
 */
async function tokenBucketRateLimit(
  redis: InstanceType<typeof Redis>,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const refillRate = config.maxRequests / config.windowSeconds; // tokens per second
  
  try {
    const data = await redis.get(key);
    let tokens = config.maxRequests;
    let lastRefill = now;
    
    if (data) {
      const parsed = JSON.parse(data);
      tokens = parsed.tokens;
      lastRefill = parsed.lastRefill;
      
      // Refill tokens based on time elapsed
      const elapsed = (now - lastRefill) / 1000;
      tokens = Math.min(
        config.maxRequests,
        tokens + elapsed * refillRate
      );
    }
    
    if (tokens < 1) {
      const timeToRefill = Math.ceil((1 - tokens) / refillRate);
      
      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        reset: now + timeToRefill * 1000,
        retryAfter: timeToRefill
      };
    }
    
    // Consume one token
    tokens -= 1;
    
    await redis.setex(
      key,
      config.windowSeconds,
      JSON.stringify({ tokens, lastRefill: now })
    );
    
    return {
      success: true,
      limit: config.maxRequests,
      remaining: Math.floor(tokens),
      reset: now + config.windowSeconds * 1000
    };
  } catch (error) {
    console.error('Token bucket rate limit error:', error);
    // Fail open
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: now + config.windowSeconds * 1000
    };
  }
}

/**
 * Apply rate limiting to a request
 * 
 * @param req - Next.js request object
 * @param config - Rate limit configuration
 * @returns NextResponse if rate limited, null otherwise
 */
export async function rateLimit(
  req: NextRequest | Request,
  config: RateLimitConfig
): Promise<Response | null> {
  try {
    const redis = getRedisClient();
    const identifier = getIdentifier(req);
    const key = `${config.keyPrefix}:${identifier}`;
    
    let result: RateLimitResult;
    
    switch (config.strategy || 'sliding') {
      case 'sliding':
        result = await slidingWindowRateLimit(redis, key, config);
        break;
      case 'fixed':
        result = await fixedWindowRateLimit(redis, key, config);
        break;
      case 'token-bucket':
        result = await tokenBucketRateLimit(redis, key, config);
        break;
      default:
        result = await slidingWindowRateLimit(redis, key, config);
    }
    
    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: result.retryAfter
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.reset.toString(),
            'Retry-After': (result.retryAfter || 60).toString()
          }
        }
      );
    }
    
    // Add rate limit info to successful response (will be added by API route)
    // Store in request context for logging
    (req as any).rateLimitInfo = {
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset
    };
    
    return null;
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // Fail open (allow request on error)
    return null;
  }
}

/**
 * Preset rate limit configurations
 */
export const RATE_LIMITS = {
  // API endpoints
  booking: {
    maxRequests: 100,
    windowSeconds: 60,
    keyPrefix: 'rl:booking',
    strategy: 'sliding' as const
  },
  
  checkout: {
    maxRequests: 10,
    windowSeconds: 3600,
    keyPrefix: 'rl:checkout',
    strategy: 'sliding' as const
  },
  
  metrics: {
    maxRequests: 10000,
    windowSeconds: 3600,
    keyPrefix: 'rl:metrics',
    strategy: 'token-bucket' as const
  },
  
  scoring: {
    maxRequests: 1000,
    windowSeconds: 3600,
    keyPrefix: 'rl:scoring',
    strategy: 'sliding' as const
  },
  
  // Authentication
  login: {
    maxRequests: 5,
    windowSeconds: 300,
    keyPrefix: 'rl:login',
    strategy: 'fixed' as const
  },
  
  signup: {
    maxRequests: 3,
    windowSeconds: 3600,
    keyPrefix: 'rl:signup',
    strategy: 'fixed' as const
  },
  
  // General API
  general: {
    maxRequests: 1000,
    windowSeconds: 60,
    keyPrefix: 'rl:api',
    strategy: 'sliding' as const
  },
  
  // Widget chat
  chat: {
    maxRequests: 100,
    windowSeconds: 60,
    keyPrefix: 'rl:chat',
    strategy: 'token-bucket' as const
  }
};

/**
 * Get rate limit status without consuming quota
 * Useful for checking limits before expensive operations
 */
export async function checkRateLimit(
  req: NextRequest | Request,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const redis = getRedisClient();
    const identifier = getIdentifier(req);
    const key = `${config.keyPrefix}:${identifier}`;
    
    const now = Date.now();
    
    if (config.strategy === 'sliding') {
      const windowStart = now - config.windowSeconds * 1000;
      await redis.zremrangebyscore(key, 0, windowStart);
      const count = await redis.zcard(key);
      
      return {
        success: count < config.maxRequests,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - count),
        reset: now + config.windowSeconds * 1000
      };
    } else {
      // For fixed window, just check current count
      const current = await redis.get(key);
      const count = current ? parseInt(current) : 0;
      
      return {
        success: count < config.maxRequests,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - count),
        reset: now + config.windowSeconds * 1000
      };
    }
  } catch (error) {
    console.error('Check rate limit error:', error);
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: Date.now() + config.windowSeconds * 1000
    };
  }
}

/**
 * Reset rate limit for a specific identifier
 * Useful for testing or manual intervention
 */
export async function resetRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${config.keyPrefix}:${identifier}`;
    await redis.del(key);
  } catch (error) {
    console.error('Reset rate limit error:', error);
  }
}

/**
 * Cleanup function for graceful shutdown
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

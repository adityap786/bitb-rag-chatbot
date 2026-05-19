/**
 * Per-Bot Rate Limiter
 * 
 * Production-grade rate limiting with multiple dimensions:
 * - Per-tenant limits (by subscription tier)
 * - Per-chatbot limits (prevents single bot exhaustion)
 * - Per-IP limits (prevents abuse from single source)
 * 
 * Uses Redis sliding window algorithm for accurate limiting.
 */

import Redis from 'ioredis';

// Lazy Redis initialization to avoid connection issues during build
let redis: Redis | null = null;

function getRedis(): Redis {
    if (!redis) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        redis = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                if (times > 3) return null;
                return Math.min(times * 100, 3000);
            },
            lazyConnect: true,
        });
    }
    return redis;
}

export interface RateLimitConfig {
    /** Max requests per window for the entire tenant */
    perTenant: number;
    /** Max requests per window per chatbot */
    perBot: number;
    /** Max requests per window per IP address */
    perIP: number;
    /** Window size in seconds */
    windowSeconds: number;
}

export interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Which limit was exceeded (if any) */
    limitType: 'tenant' | 'bot' | 'ip' | null;
    /** Remaining requests in current window */
    remaining: number;
    /** Unix timestamp when the limit resets */
    resetAt: number;
    /** Current request counts */
    counts: {
        tenant: number;
        bot: number;
        ip: number;
    };
}

// Default rate limits by plan tier
export const RATE_LIMIT_TIERS: Record<string, RateLimitConfig> = {
    trial: {
        perTenant: 100,   // 100 requests per minute total
        perBot: 50,       // 50 per bot
        perIP: 10,        // 10 per IP
        windowSeconds: 60,
    },
    starter: {
        perTenant: 500,
        perBot: 200,
        perIP: 30,
        windowSeconds: 60,
    },
    growth: {
        perTenant: 2000,
        perBot: 500,
        perIP: 50,
        windowSeconds: 60,
    },
    scale: {
        perTenant: 10000,
        perBot: 2000,
        perIP: 100,
        windowSeconds: 60,
    },
    enterprise: {
        perTenant: 50000,
        perBot: 10000,
        perIP: 200,
        windowSeconds: 60,
    },
};

/**
 * Check rate limits for a request
 * 
 * @param tenantId - The tenant ID
 * @param chatbotId - The chatbot ID (optional for non-chat endpoints)
 * @param ipAddress - Client IP address
 * @param tier - Subscription tier (defaults to 'trial')
 * @returns Rate limit check result
 */
export async function checkRateLimit(
    tenantId: string,
    chatbotId: string | null,
    ipAddress: string,
    tier: string = 'trial'
): Promise<RateLimitResult> {
    const config = RATE_LIMIT_TIERS[tier] || RATE_LIMIT_TIERS.trial;
    const redis = getRedis();

    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / config.windowSeconds) * config.windowSeconds;
    const resetAt = window + config.windowSeconds;

    try {
        // Use pipeline for atomic operations
        const pipeline = redis.pipeline();

        // Tenant-level key
        const tenantKey = `ratelimit:tenant:${tenantId}:${window}`;
        pipeline.incr(tenantKey);
        pipeline.expire(tenantKey, config.windowSeconds + 1);

        // Bot-level key (if chatbotId provided)
        const botKey = chatbotId ? `ratelimit:bot:${chatbotId}:${window}` : null;
        if (botKey) {
            pipeline.incr(botKey);
            pipeline.expire(botKey, config.windowSeconds + 1);
        }

        // IP-level key (scoped to chatbot for granularity)
        const ipKey = `ratelimit:ip:${chatbotId || tenantId}:${ipAddress}:${window}`;
        pipeline.incr(ipKey);
        pipeline.expire(ipKey, config.windowSeconds + 1);

        const results = await pipeline.exec();

        // Extract counts from pipeline results
        // Results are in order: [tenantIncr, tenantExpire, botIncr?, botExpire?, ipIncr, ipExpire]
        const tenantCount = (results?.[0]?.[1] as number) || 0;
        let botCount = 0;
        let ipCount = 0;

        if (botKey) {
            botCount = (results?.[2]?.[1] as number) || 0;
            ipCount = (results?.[4]?.[1] as number) || 0;
        } else {
            ipCount = (results?.[2]?.[1] as number) || 0;
        }

        // Check limits
        let limitType: 'tenant' | 'bot' | 'ip' | null = null;

        if (tenantCount > config.perTenant) {
            limitType = 'tenant';
        } else if (botKey && botCount > config.perBot) {
            limitType = 'bot';
        } else if (ipCount > config.perIP) {
            limitType = 'ip';
        }

        const allowed = limitType === null;

        // Calculate remaining (use the most restrictive limit)
        const remaining = Math.max(0, Math.min(
            config.perTenant - tenantCount,
            botKey ? config.perBot - botCount : Infinity,
            config.perIP - ipCount
        ));

        return {
            allowed,
            limitType,
            remaining,
            resetAt,
            counts: {
                tenant: tenantCount,
                bot: botCount,
                ip: ipCount,
            },
        };
    } catch (error) {
        console.error('Rate limit check failed:', error);
        // Fail open on Redis errors (allow request but log)
        return {
            allowed: true,
            limitType: null,
            remaining: 1,
            resetAt,
            counts: { tenant: 0, bot: 0, ip: 0 },
        };
    }
}

/**
 * Generate rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult, config?: RateLimitConfig): Record<string, string> {
    const effectiveConfig = config || RATE_LIMIT_TIERS.trial;
    const retryAfter = Math.max(0, result.resetAt - Math.floor(Date.now() / 1000));

    return {
        'X-RateLimit-Limit': String(effectiveConfig.perTenant),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt),
        ...(result.allowed ? {} : { 'Retry-After': String(retryAfter) }),
    };
}

/**
 * Convenience function for chat endpoints
 */
export async function checkChatRateLimit(
    tenantId: string,
    chatbotId: string,
    ipAddress: string,
    tier: string = 'trial'
): Promise<RateLimitResult> {
    return checkRateLimit(tenantId, chatbotId, ipAddress, tier);
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
    tenantId: string,
    chatbotId: string | null,
    ipAddress: string
): Promise<{ tenant: number; bot: number; ip: number }> {
    const redis = getRedis();
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / 60) * 60; // 60 second window

    try {
        const pipeline = redis.pipeline();

        const tenantKey = `ratelimit:tenant:${tenantId}:${window}`;
        pipeline.get(tenantKey);

        const botKey = chatbotId ? `ratelimit:bot:${chatbotId}:${window}` : null;
        if (botKey) {
            pipeline.get(botKey);
        }

        const ipKey = `ratelimit:ip:${chatbotId || tenantId}:${ipAddress}:${window}`;
        pipeline.get(ipKey);

        const results = await pipeline.exec();

        return {
            tenant: parseInt((results?.[0]?.[1] as string) || '0'),
            bot: botKey ? parseInt((results?.[1]?.[1] as string) || '0') : 0,
            ip: parseInt((results?.[botKey ? 2 : 1]?.[1] as string) || '0'),
        };
    } catch (error) {
        console.error('Failed to get rate limit status:', error);
        return { tenant: 0, bot: 0, ip: 0 };
    }
}

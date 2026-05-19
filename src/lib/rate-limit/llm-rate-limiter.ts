/**
 * LLM Provider Rate Limiter
 * 
 * Token bucket rate limiting for LLM API calls:
 * - Per-provider limits (Groq, Anthropic)
 * - Token-based limiting (not just request count)
 * - Tenant-scoped quotas
 * - Circuit breaker for provider failures
 */

import { logger } from '@/lib/observability/logger';

// ============================================================
// Configuration
// ============================================================

export interface LLMProviderConfig {
    /** Provider name */
    name: string;
    /** Requests per minute limit */
    requestsPerMinute: number;
    /** Tokens per minute limit (input + output) */
    tokensPerMinute: number;
    /** Tokens per day limit */
    tokensPerDay: number;
    /** Max concurrent requests */
    maxConcurrent: number;
    /** Circuit breaker threshold (failures before opening) */
    circuitBreakerThreshold: number;
    /** Circuit breaker reset time (ms) */
    circuitBreakerResetMs: number;
}

// Provider-specific limits (based on free tier / typical limits)
export const LLM_PROVIDER_CONFIGS: Record<string, LLMProviderConfig> = {
    groq: {
        name: 'Groq',
        requestsPerMinute: 30,
        tokensPerMinute: 30000,
        tokensPerDay: 500000,
        maxConcurrent: 10,
        circuitBreakerThreshold: 5,
        circuitBreakerResetMs: 60000,
    },
    anthropic: {
        name: 'Anthropic',
        requestsPerMinute: 50,
        tokensPerMinute: 40000,
        tokensPerDay: 500000,
        maxConcurrent: 15,
        circuitBreakerThreshold: 5,
        circuitBreakerResetMs: 45000,
    },
};

// ============================================================
// Token Bucket State
// ============================================================

interface TokenBucket {
    tokens: number;
    lastRefill: number;
}

interface RateLimitState {
    requestBucket: TokenBucket;
    tokenBucket: TokenBucket;
    dailyTokens: { count: number; dayStart: number };
    concurrent: number;
    circuitBreaker: {
        failures: number;
        lastFailure: number;
        isOpen: boolean;
        openedAt: number;
    };
}

// In-memory state (use Redis in production for distributed systems)
const providerStates = new Map<string, RateLimitState>();

function getState(provider: string): RateLimitState {
    if (!providerStates.has(provider)) {
        const config = LLM_PROVIDER_CONFIGS[provider] || LLM_PROVIDER_CONFIGS.groq;
        const now = Date.now();

        providerStates.set(provider, {
            requestBucket: { tokens: config.requestsPerMinute, lastRefill: now },
            tokenBucket: { tokens: config.tokensPerMinute, lastRefill: now },
            dailyTokens: { count: 0, dayStart: getStartOfDay(now) },
            concurrent: 0,
            circuitBreaker: {
                failures: 0,
                lastFailure: 0,
                isOpen: false,
                openedAt: 0,
            },
        });
    }
    return providerStates.get(provider)!;
}

function getStartOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

// ============================================================
// Token Bucket Operations
// ============================================================

function refillBucket(
    bucket: TokenBucket,
    maxTokens: number,
    windowSeconds: number
): number {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    const refillRate = maxTokens / windowSeconds;

    const newTokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
    bucket.tokens = newTokens;
    bucket.lastRefill = now;

    return newTokens;
}

function consumeTokens(bucket: TokenBucket, amount: number): boolean {
    if (bucket.tokens >= amount) {
        bucket.tokens -= amount;
        return true;
    }
    return false;
}

// ============================================================
// Rate Limit Check Results
// ============================================================

export interface LLMRateLimitResult {
    allowed: boolean;
    reason?: 'request_limit' | 'token_limit' | 'daily_limit' | 'concurrent_limit' | 'circuit_open';
    retryAfterMs?: number;
    remaining: {
        requests: number;
        minuteTokens: number;
        dailyTokens: number;
        concurrent: number;
    };
    circuitBreakerStatus: 'closed' | 'open' | 'half-open';
}

// ============================================================
// Main Rate Limiting Functions
// ============================================================

/**
 * Check if an LLM request is allowed
 * 
 * @param provider - LLM provider name (groq, anthropic)
 * @param estimatedTokens - Estimated tokens for the request
 * @param tenantId - Optional tenant ID for scoped limits
 */
export function checkLLMRateLimit(
    provider: string,
    estimatedTokens: number = 1000,
    tenantId?: string
): LLMRateLimitResult {
    const config = LLM_PROVIDER_CONFIGS[provider] || LLM_PROVIDER_CONFIGS.groq;
    const stateKey = tenantId ? `${provider}:${tenantId}` : provider;
    const state = getState(stateKey);
    const now = Date.now();

    // Check circuit breaker
    if (state.circuitBreaker.isOpen) {
        const timeSinceOpen = now - state.circuitBreaker.openedAt;

        if (timeSinceOpen < config.circuitBreakerResetMs) {
            return {
                allowed: false,
                reason: 'circuit_open',
                retryAfterMs: config.circuitBreakerResetMs - timeSinceOpen,
                remaining: {
                    requests: 0,
                    minuteTokens: 0,
                    dailyTokens: config.tokensPerDay - state.dailyTokens.count,
                    concurrent: config.maxConcurrent - state.concurrent,
                },
                circuitBreakerStatus: 'open',
            };
        }

        // Half-open: allow one request to test
        state.circuitBreaker.isOpen = false;
        logger.info('Circuit breaker half-open', { provider, tenantId });
    }

    // Check concurrent limit
    if (state.concurrent >= config.maxConcurrent) {
        return {
            allowed: false,
            reason: 'concurrent_limit',
            retryAfterMs: 1000,
            remaining: {
                requests: Math.floor(state.requestBucket.tokens),
                minuteTokens: Math.floor(state.tokenBucket.tokens),
                dailyTokens: config.tokensPerDay - state.dailyTokens.count,
                concurrent: 0,
            },
            circuitBreakerStatus: 'closed',
        };
    }

    // Refill buckets
    refillBucket(state.requestBucket, config.requestsPerMinute, 60);
    refillBucket(state.tokenBucket, config.tokensPerMinute, 60);

    // Reset daily counter if new day
    const dayStart = getStartOfDay(now);
    if (state.dailyTokens.dayStart < dayStart) {
        state.dailyTokens = { count: 0, dayStart };
    }

    // Check request bucket
    if (state.requestBucket.tokens < 1) {
        const refillRate = config.requestsPerMinute / 60;
        const waitTime = Math.ceil((1 - state.requestBucket.tokens) / refillRate * 1000);

        return {
            allowed: false,
            reason: 'request_limit',
            retryAfterMs: waitTime,
            remaining: {
                requests: 0,
                minuteTokens: Math.floor(state.tokenBucket.tokens),
                dailyTokens: config.tokensPerDay - state.dailyTokens.count,
                concurrent: config.maxConcurrent - state.concurrent,
            },
            circuitBreakerStatus: 'closed',
        };
    }

    // Check token bucket
    if (state.tokenBucket.tokens < estimatedTokens) {
        const refillRate = config.tokensPerMinute / 60;
        const waitTime = Math.ceil((estimatedTokens - state.tokenBucket.tokens) / refillRate * 1000);

        return {
            allowed: false,
            reason: 'token_limit',
            retryAfterMs: waitTime,
            remaining: {
                requests: Math.floor(state.requestBucket.tokens),
                minuteTokens: 0,
                dailyTokens: config.tokensPerDay - state.dailyTokens.count,
                concurrent: config.maxConcurrent - state.concurrent,
            },
            circuitBreakerStatus: 'closed',
        };
    }

    // Check daily limit
    if (state.dailyTokens.count + estimatedTokens > config.tokensPerDay) {
        const tomorrow = dayStart + 24 * 60 * 60 * 1000;
        const waitTime = tomorrow - now;

        return {
            allowed: false,
            reason: 'daily_limit',
            retryAfterMs: waitTime,
            remaining: {
                requests: Math.floor(state.requestBucket.tokens),
                minuteTokens: Math.floor(state.tokenBucket.tokens),
                dailyTokens: 0,
                concurrent: config.maxConcurrent - state.concurrent,
            },
            circuitBreakerStatus: 'closed',
        };
    }

    // All checks passed
    return {
        allowed: true,
        remaining: {
            requests: Math.floor(state.requestBucket.tokens) - 1,
            minuteTokens: Math.floor(state.tokenBucket.tokens) - estimatedTokens,
            dailyTokens: config.tokensPerDay - state.dailyTokens.count - estimatedTokens,
            concurrent: config.maxConcurrent - state.concurrent - 1,
        },
        circuitBreakerStatus: state.circuitBreaker.failures > 0 ? 'half-open' : 'closed',
    };
}

/**
 * Consume rate limit quota after request is allowed
 */
export function consumeLLMQuota(
    provider: string,
    actualTokens: number,
    tenantId?: string
): void {
    const stateKey = tenantId ? `${provider}:${tenantId}` : provider;
    const state = getState(stateKey);

    // Consume from buckets
    consumeTokens(state.requestBucket, 1);
    consumeTokens(state.tokenBucket, actualTokens);

    // Add to daily count
    state.dailyTokens.count += actualTokens;

    // Increment concurrent
    state.concurrent++;
}

/**
 * Release concurrent slot after request completes
 */
export function releaseLLMSlot(provider: string, tenantId?: string): void {
    const stateKey = tenantId ? `${provider}:${tenantId}` : provider;
    const state = getState(stateKey);
    state.concurrent = Math.max(0, state.concurrent - 1);
}

/**
 * Record LLM request failure for circuit breaker
 */
export function recordLLMFailure(provider: string, tenantId?: string): void {
    const config = LLM_PROVIDER_CONFIGS[provider] || LLM_PROVIDER_CONFIGS.groq;
    const stateKey = tenantId ? `${provider}:${tenantId}` : provider;
    const state = getState(stateKey);
    const now = Date.now();

    state.circuitBreaker.failures++;
    state.circuitBreaker.lastFailure = now;

    if (state.circuitBreaker.failures >= config.circuitBreakerThreshold) {
        state.circuitBreaker.isOpen = true;
        state.circuitBreaker.openedAt = now;

        logger.warn('Circuit breaker opened', {
            provider,
            tenantId,
            failures: state.circuitBreaker.failures,
        });
    }
}

/**
 * Record LLM request success (resets circuit breaker)
 */
export function recordLLMSuccess(provider: string, tenantId?: string): void {
    const stateKey = tenantId ? `${provider}:${tenantId}` : provider;
    const state = getState(stateKey);

    if (state.circuitBreaker.failures > 0) {
        state.circuitBreaker.failures = 0;
        logger.info('Circuit breaker reset', { provider, tenantId });
    }
}

/**
 * Get current rate limit status (for monitoring)
 */
export function getLLMRateLimitStatus(
    provider: string,
    tenantId?: string
): LLMRateLimitResult {
    return checkLLMRateLimit(provider, 0, tenantId);
}

// ============================================================
// Wrapper for LLM Calls
// ============================================================

export interface LLMCallOptions {
    provider: string;
    tenantId?: string;
    estimatedTokens?: number;
}

/**
 * Execute an LLM call with rate limiting
 */
export async function withLLMRateLimit<T>(
    options: LLMCallOptions,
    fn: () => Promise<T>
): Promise<{ success: true; result: T; tokensUsed?: number } | { success: false; error: string; retryAfterMs?: number }> {
    const { provider, tenantId, estimatedTokens = 1000 } = options;

    // Check rate limit
    const check = checkLLMRateLimit(provider, estimatedTokens, tenantId);
    if (!check.allowed) {
        logger.warn('LLM rate limit exceeded', {
            provider,
            tenantId,
            reason: check.reason,
            retryAfterMs: check.retryAfterMs,
        });

        return {
            success: false,
            error: `Rate limit exceeded: ${check.reason}`,
            retryAfterMs: check.retryAfterMs,
        };
    }

    // Consume quota
    consumeLLMQuota(provider, estimatedTokens, tenantId);

    try {
        const result = await fn();

        // Record success
        recordLLMSuccess(provider, tenantId);
        releaseLLMSlot(provider, tenantId);

        return { success: true, result };
    } catch (error) {
        // Record failure
        recordLLMFailure(provider, tenantId);
        releaseLLMSlot(provider, tenantId);

        throw error;
    }
}

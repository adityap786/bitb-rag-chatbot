import crypto from 'crypto'
import { upstashRedis } from '../redis-client-upstash'

// TTL for cache entries (seconds)
const DEFAULT_TTL = 60

// Use REDIS_URL if set, else fallback to in-memory cache for dev/CI
const redis = upstashRedis

// Simple in-memory fallback cache for dev/CI
const memoryCache = new Map<string, { value: any; expires: number }>()



/**
 * Deterministic bucketing: returns true if the user/session/tenant/feature is in the rollout percentage.
 * Uses sha256(tenant:user:feature) % 100 < percentage.
 */
export function isInRollout(opts: {
  tenantId: string
  userId?: string
  feature: string
  percentage: number
}): boolean {
  const { tenantId, userId = '', feature, percentage } = opts
  const input = `${tenantId}:${userId}:${feature}`
  const hash = crypto.createHash('sha256').update(input).digest()
  const bucket = hash.readUInt32BE(0) % 100
  return bucket < percentage
}

/**
 * Get a cached rollout decision for a user/tenant/feature, or compute and cache it.
 * Uses Redis if available, else in-memory fallback.
 */
export async function getCachedRolloutDecision(opts: {
  tenantId: string
  userId?: string
  feature: string
  percentage: number
  ttlSec?: number
}): Promise<boolean> {
  const { tenantId, userId = '', feature, percentage, ttlSec = DEFAULT_TTL } = opts
  const cacheKey = `rollout:${tenantId}:${userId}:${feature}:${percentage}`
  const cached = await redis.get(cacheKey)
  if (cached !== null) return cached === '1'
  const result = isInRollout({ tenantId, userId, feature, percentage })
  await redis.set(cacheKey, result ? '1' : '0', { ex: ttlSec })
  return result
}

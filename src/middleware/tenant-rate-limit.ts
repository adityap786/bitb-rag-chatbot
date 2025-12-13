import { redis as upstashRedis } from '@/lib/redis-client';

const redisClient = upstashRedis as any;

/**
 * Returns true if under the limit, false if exceeded.
 */
export async function checkTenantRateLimit(tenantId: string, limit = 20, windowSec = 60): Promise<boolean> {
  const key = `rate_limit:${tenantId}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const count = await redisClient.incr(key);
  if (count === 1) {
    if (typeof redisClient.expire === 'function') {
      await redisClient.expire(key, windowSec);
    } else if (typeof redisClient.set === 'function') {
      // Fallback for Upstash: set with expiry
      await redisClient.set(key, String(count), { ex: windowSec });
    }
  }
  return count <= limit;
}

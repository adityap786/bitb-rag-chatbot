import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

/**
 * Returns true if under the limit, false if exceeded.
 */
export async function checkTenantRateLimit(tenantId: string, limit = 20, windowSec = 60): Promise<boolean> {
  const key = `rate_limit:${tenantId}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }
  return count <= limit;
}

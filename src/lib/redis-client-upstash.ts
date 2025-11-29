import { Redis } from '@upstash/redis';

// Production-level Upstash Redis client
// Reads config from environment variables UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// Throws if not configured
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error('Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your environment.');
}

export const upstashRedis = new Redis({
  url: redisUrl,
  token: redisToken,
});

// Example usage:
// await upstashRedis.set('key', 'value');
// const value = await upstashRedis.get('key');

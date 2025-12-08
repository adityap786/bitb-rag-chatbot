import { upstashRedis } from './redis-client-upstash';

// Central Redis client used by the app and tests.
// - If `REDIS_URL` is provided we create a real ioredis client.
// - In `NODE_ENV==='test'` with no `REDIS_URL` we export a tiny in-memory/mock
//   implementation to avoid hard dependency on a running Redis server during
//   isolated test runs. This keeps tests from failing with "module not found".



// Type for Upstash Redis client operations we use
interface RedisLike {
  set(key: string, value: string, opts?: { ex?: number }): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  incrby(key: string, amount: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// Use Upstash Redis for all environments except test/mock
const redis: RedisLike = upstashRedis;

export { redis };
export type { RedisLike };

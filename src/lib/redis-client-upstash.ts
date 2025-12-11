import { Redis } from '@upstash/redis';

type ExpiringValue = { value: any; expiresAt?: number };

class InMemoryRedis {
  private store = new Map<string, ExpiringValue>();

  private isExpired(key: string) {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (!entry.expiresAt) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  private ensure(key: string) {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(key)) return null;
    return entry.value;
  }

  async get(key: string) {
    const v = this.ensure(key);
    return v ?? null;
  }

  async set(key: string, value: any) {
    this.store.set(key, { value });
    return 'OK';
  }

  async hmget(key: string, ...fields: string[]) {
    const obj = this.ensure(key);
    if (!obj || typeof obj !== 'object') return fields.map(() => null);
    return fields.map(f => (obj as any)[f] ?? null);
  }

  async hmset(key: string, values: Record<string, string>) {
    const existing = this.ensure(key);
    const base = existing && typeof existing === 'object' ? (existing as any) : {};
    this.store.set(key, { value: { ...base, ...values } });
    return 'OK';
  }

  async pexpire(key: string, ms: number) {
    const existing = this.ensure(key);
    if (existing === null) return 0;
    this.store.set(key, { value: existing, expiresAt: Date.now() + ms });
    return 1;
  }

  async del(...keys: string[]) {
    let count = 0;
    keys.forEach(k => {
      if (this.store.delete(k)) count++;
    });
    return count;
  }

  async keys(pattern: string) {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    const result: string[] = [];
    for (const key of this.store.keys()) {
      if (this.isExpired(key)) continue;
      if (regex.test(key)) result.push(key);
    }
    return result;
  }
}

// Production-level Upstash Redis client
// Reads config from environment variables UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// In test mode or when explicitly requested, falls back to in-memory mock to avoid network
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const useMock =
  process.env.REDIS_USE_MOCK === 'true' ||
  process.env.NODE_ENV === 'test' ||
  !redisUrl ||
  !redisToken ||
  (redisUrl ?? '').includes('mock.upstash.io');

export const upstashRedis = useMock
  ? (new InMemoryRedis() as any)
  : new Redis({
      url: redisUrl as string,
      token: redisToken as string,
    });

// Example usage:
// await upstashRedis.set('key', 'value');
// const value = await upstashRedis.get('key');

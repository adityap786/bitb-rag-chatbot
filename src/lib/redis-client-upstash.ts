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

  async set(key: string, value: any, opts?: { ex?: number }) {
    const entry: ExpiringValue = { value };
    if (opts?.ex && opts.ex > 0) {
      entry.expiresAt = Date.now() + opts.ex * 1000;
    }
    this.store.set(key, entry);
    return 'OK';
  }

  async incr(key: string) {
    return this.incrby(key, 1);
  }

  async incrby(key: string, amount: number) {
    const current = this.ensure(key);
    const currentNum = typeof current === 'number' ? current : Number.parseInt(String(current ?? '0'), 10);
    const next = (Number.isFinite(currentNum) ? currentNum : 0) + amount;
    const existing = this.store.get(key);
    this.store.set(key, { value: next, expiresAt: existing?.expiresAt });
    return next;
  }

  async expire(key: string, seconds: number) {
    if (seconds <= 0) return 0;
    const current = this.ensure(key);
    if (current === null) return 0;
    this.store.set(key, { value: current, expiresAt: Date.now() + seconds * 1000 });
    return 1;
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

// Whether a real BullMQ/Redis URL is configured (for diagnostics)
const preferRealRedis = Boolean(process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL);

// If a BullMQ/Redis URL is present, prefer the real Upstash client regardless
// of local/mock flags. This ensures BullMQ connections (which require a
// redis:// or rediss:// URL) don't accidentally fall back to an in-memory mock.
let useMock = false;
if (preferRealRedis) {
  useMock = false;
} else {
  useMock =
    process.env.REDIS_USE_MOCK === 'true' ||
    process.env.NODE_ENV === 'test' ||
    !redisUrl ||
    !redisToken ||
    (redisUrl ?? '').includes('mock.upstash.io');
}

console.log('[DEBUG] redis-client-upstash preferRealRedis:', preferRealRedis);
console.log('[DEBUG] redis-client-upstash UPSTASH_REDIS_REST_URL:', redisUrl ? '[REDACTED]' : undefined);
console.log('[DEBUG] redis-client-upstash REDIS_USE_MOCK flag:', process.env.REDIS_USE_MOCK);
console.log('[DEBUG] redis-client-upstash useMock (after prefer override):', useMock);

export const upstashRedis = useMock
  ? (new InMemoryRedis() as any)
  : new Redis({
      url: redisUrl as string,
      token: redisToken as string,
    });

// Example usage:
// await upstashRedis.set('key', 'value');
// const value = await upstashRedis.get('key');

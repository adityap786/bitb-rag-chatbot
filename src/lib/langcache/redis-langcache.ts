import { upstashRedis } from '../redis-client-upstash';
import { logger } from '../observability/logger.js';


export interface RedisLangCacheOptions {
  namespace?: string;
  defaultTtlSeconds?: number;
}

export interface RedisLangCacheStats {
  hits: number;
  misses: number;
  errors: number;
}

// Upstash-based RedisLangCache
export class RedisLangCache<T = unknown> {
  private readonly namespace: string;
  private readonly defaultTtlSeconds: number;
  private readonly stats: RedisLangCacheStats = { hits: 0, misses: 0, errors: 0 };

  // Upstash client is imported from upstashRedis
  constructor(options?: RedisLangCacheOptions) {
    this.namespace = options?.namespace ?? 'langcache';
    this.defaultTtlSeconds = options?.defaultTtlSeconds ?? 300;
  }

  private buildKey(key: string): string {
    return `${this.namespace}:${key}`;
  }


  async get(key: string): Promise<T | null> {
    try {
      const raw = await upstashRedis.get(this.buildKey(key));
      if (raw === null || raw === undefined) {
        this.stats.misses += 1;
        return null;
      }
      this.stats.hits += 1;
      // Upstash returns parsed JSON if set as object, but for safety:
      if (typeof raw === 'string') {
        return JSON.parse(raw) as T;
      }
      return raw as T;
    } catch (error) {
      this.stats.errors += 1;
      logger.warn('RedisLangCache get failed', {
        namespace: this.namespace,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }


  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      // Upstash set supports EX option for TTL
      await upstashRedis.set(this.buildKey(key), JSON.stringify(value), {
        ex: ttlSeconds ?? this.defaultTtlSeconds,
      });
    } catch (error) {
      this.stats.errors += 1;
      logger.warn('RedisLangCache set failed', {
        namespace: this.namespace,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }


  async del(key: string): Promise<void> {
    try {
      await upstashRedis.del(this.buildKey(key));
    } catch (error) {
      this.stats.errors += 1;
      logger.warn('RedisLangCache delete failed', {
        namespace: this.namespace,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getStats(): Promise<RedisLangCacheStats> {
    return { ...this.stats };
  }

  // Upstash does not support server version checks or event listeners
  // This method is now a no-op
  private async ensureMinimumVersion() {
    return;
  }
}

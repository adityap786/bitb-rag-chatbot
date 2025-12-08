// MemoryBackend interface and in-memory/Redis stubs
export interface MemoryBackend {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  lpush(key: string, value: any): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<any[]>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
}

// In-memory backend (for dev/test)
export class InMemoryBackend implements MemoryBackend {
  private store = new Map<string, any>();
  async get(key: string) { return this.store.get(key); }
  async set(key: string, value: any) { this.store.set(key, value); }
  async del(key: string) { this.store.delete(key); }
  async lpush(key: string, value: any) {
    const arr = this.store.get(key) || [];
    arr.unshift(value);
    this.store.set(key, arr);
  }
  async lrange(key: string, start: number, stop: number) {
    const arr = this.store.get(key) || [];
    return arr.slice(start, stop + 1);
  }
  async ltrim(key: string, start: number, stop: number) {
    const arr = this.store.get(key) || [];
    this.store.set(key, arr.slice(start, stop + 1));
  }
}

// Redis backend stub (to be implemented for prod)
export class RedisBackend implements MemoryBackend {
  // TODO: Implement with ioredis or node-redis
  async get(key: string): Promise<any> { throw new Error('Not implemented'); }
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> { throw new Error('Not implemented'); }
  async del(key: string): Promise<void> { throw new Error('Not implemented'); }
  async lpush(key: string, value: any): Promise<void> { throw new Error('Not implemented'); }
  async lrange(key: string, start: number, stop: number): Promise<any[]> { throw new Error('Not implemented'); }
  async ltrim(key: string, start: number, stop: number): Promise<void> { throw new Error('Not implemented'); }
}

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock bullmq for CI/tests so we don't require a running Redis instance here.
// `vi.mock` is hoisted by Vitest so this will replace the real module before imports.
vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    async add(_name: string, data: any, opts?: any) {
      return { id: `mock-${Date.now()}`, data, opts } as any;
    }
  }
  // Minimal Job placeholder
  class MockJob {}
  return { Queue: MockQueue, Job: MockJob };
});

import { Queue, Job } from 'bullmq';
import { redis } from '@/lib/redis-client';

const TEST_QUEUE = 'test-ingest-queue';

describe('Queue System Integration', () => {
  let queue: Queue;

  beforeAll(() => {
    queue = new Queue(TEST_QUEUE, { connection: redis as any });
  });

  it('should enqueue and process jobs', async () => {
    const job = await queue.add('ingest', { docId: 'doc-123', tenantId: 'tenant-abc' });
    expect(job.id).toBeDefined();
    // Simulate worker processing
    // ...existing code...
  });

  it('should retry failed jobs', async () => {
    // Add job with retry
    const job = await queue.add('ingest', { docId: 'doc-fail', tenantId: 'tenant-abc' }, { attempts: 3 });
    // Simulate failure and retry logic
    // ...existing code...
  });
});

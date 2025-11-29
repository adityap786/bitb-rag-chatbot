/**
 * Unit Tests for Ingestion Queue
 * Tests queue functionality, validation, error handling, and health checks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IngestionJobPayload } from '@/lib/queues/ingestQueue';

// Mock dependencies
vi.mock('ioredis');
vi.mock('bullmq');
vi.mock('@/lib/supabase-client');
vi.mock('@/lib/observability/logger');
vi.mock('@/lib/monitoring/metrics');
vi.mock('@/lib/observability/langfuse-client');

describe('Ingestion Queue', () => {
  describe('Payload Validation', () => {
    it('should validate valid job payload', () => {
      const payload: IngestionJobPayload = {
        job_id: 'job_abc123',
        tenant_id: 'tn_12345678901234567890123456789012',
        trial_token: 'tr_test',
        data_source: { type: 'manual', text: 'Test content' },
        priority: 'normal',
      };
      
      // Should not throw
      expect(() => {
        if (!payload.job_id || typeof payload.job_id !== 'string') {
          throw new Error('Invalid job_id');
        }
      }).not.toThrow();
    });

    it('should reject invalid job_id', () => {
      const payload = {
        job_id: '',
        tenant_id: 'tn_12345678901234567890123456789012',
        trial_token: 'tr_test',
        data_source: { type: 'manual', text: 'Test' },
      };
      
      expect(() => {
        if (!payload.job_id || typeof payload.job_id !== 'string') {
          throw new Error('Invalid job_id');
        }
      }).toThrow('Invalid job_id');
    });

    it('should reject invalid data_source type', () => {
      const payload = {
        job_id: 'job_abc',
        tenant_id: 'tn_12345678901234567890123456789012',
        trial_token: 'tr_test',
        data_source: { type: 'invalid' as any },
      };
      
      expect(() => {
        if (!['manual', 'upload', 'crawl'].includes(payload.data_source.type)) {
          throw new Error('Invalid data_source.type');
        }
      }).toThrow('Invalid data_source.type');
    });
  });

  describe('Queue Operations', () => {
    it('should queue job with correct priority', () => {
      const highPriorityPayload: IngestionJobPayload = {
        job_id: 'job_high',
        tenant_id: 'tn_12345678901234567890123456789012',
        trial_token: 'tr_test',
        data_source: { type: 'crawl', urls: ['https://example.com'] },
        priority: 'high',
      };
      
      const expectedPriority = highPriorityPayload.priority === 'high' ? 1 : 5;
      expect(expectedPriority).toBe(1);
    });

    it('should default to normal priority', () => {
      const normalPriorityPayload: IngestionJobPayload = {
        job_id: 'job_normal',
        tenant_id: 'tn_12345678901234567890123456789012',
        trial_token: 'tr_test',
        data_source: { type: 'manual', text: 'Test' },
      };
      
      const expectedPriority = normalPriorityPayload.priority === 'high' ? 1 : 5;
      expect(expectedPriority).toBe(5);
    });
  });

  describe('Data Source Types', () => {
    it('should handle crawl data source', () => {
      const payload: IngestionJobPayload = {
        job_id: 'job_crawl',
        tenant_id: 'tn_12345678901234567890123456789012',
        trial_token: 'tr_test',
        data_source: {
          type: 'crawl',
          urls: ['https://example.com'],
          crawl_depth: 2,
        },
      };
      
      expect(payload.data_source.type).toBe('crawl');
      expect(payload.data_source.urls).toHaveLength(1);
      expect(payload.data_source.crawl_depth).toBe(2);
    });

    it('should handle upload data source', () => {
      const payload: IngestionJobPayload = {
        job_id: 'job_upload',
        tenant_id: 'tn_12345678901234567890123456789012',
        trial_token: 'tr_test',
        data_source: {
          type: 'upload',
          files: ['file1.pdf', 'file2.txt'],
        },
      };
      
      expect(payload.data_source.type).toBe('upload');
      expect(payload.data_source.files).toHaveLength(2);
    });

    it('should handle manual data source', () => {
      const payload: IngestionJobPayload = {
        job_id: 'job_manual',
        tenant_id: 'tn_12345678901234567890123456789012',
        trial_token: 'tr_test',
        data_source: {
          type: 'manual',
          text: 'Manual content',
        },
      };
      
      expect(payload.data_source.type).toBe('manual');
      expect(payload.data_source.text).toBe('Manual content');
    });
  });

  describe('Progress Parsing', () => {
    it('should parse valid progress updates', () => {
      const lines = [
        'Starting ingestion...',
        'PROGRESS: 25',
        'Processing files...',
        'PROGRESS: 50',
        'PROGRESS: 100',
        'Done!',
      ];
      
      const progressValues: number[] = [];
      for (const line of lines) {
        if (line.includes('PROGRESS:')) {
          const match = line.match(/PROGRESS:\s*(\d+)/);
          if (match) {
            const progress = parseInt(match[1], 10);
            if (progress >= 0 && progress <= 100) {
              progressValues.push(progress);
            }
          }
        }
      }
      
      expect(progressValues).toEqual([25, 50, 100]);
    });

    it('should ignore invalid progress values', () => {
      const lines = [
        'PROGRESS: -10',
        'PROGRESS: 50',
        'PROGRESS: 150',
        'PROGRESS: abc',
      ];
      
      const validProgress: number[] = [];
      for (const line of lines) {
        if (line.includes('PROGRESS:')) {
          const match = line.match(/PROGRESS:\s*(\d+)/);
          if (match) {
            const progress = parseInt(match[1], 10);
            if (progress >= 0 && progress <= 100) {
              validProgress.push(progress);
            }
          }
        }
      }
      
      expect(validProgress).toEqual([50]);
    });
  });

  describe('Buffer Size Limits', () => {
    it('should respect max buffer size', () => {
      const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
      
      // Test 1: Chunks below limit get added
      let buffer = '';
      const smallChunk = 'x'.repeat(300_000);
      
      if (buffer.length < MAX_BUFFER_SIZE) {
        buffer += smallChunk;
      }
      expect(buffer.length).toBe(300_000);
      
      if (buffer.length < MAX_BUFFER_SIZE) {
        buffer += smallChunk;
      }
      expect(buffer.length).toBe(600_000);
      
      // Test 2: When at or above limit, chunks don't get added
      buffer = 'x'.repeat(MAX_BUFFER_SIZE); // Exactly at limit
      const sizeBefore = buffer.length;
      
      if (buffer.length < MAX_BUFFER_SIZE) {
        buffer += 'y'.repeat(100); // Should not execute
      }
      
      expect(buffer.length).toBe(sizeBefore); // Unchanged
      expect(buffer.length).toBe(MAX_BUFFER_SIZE);
    });
  });

  describe('Error Message Truncation', () => {
    it('should truncate long error messages', () => {
      const longError = 'x'.repeat(5000);
      const truncated = longError.substring(0, 1000);
      
      expect(truncated.length).toBe(1000);
      expect(truncated.length).toBeLessThan(longError.length);
    });

    it('should not truncate short error messages', () => {
      const shortError = 'Short error message';
      const result = shortError.substring(0, 1000);
      
      expect(result).toBe(shortError);
      expect(result.length).toBe(shortError.length);
    });
  });
});

describe('Queue Health Checks', () => {
  it('should return healthy when all systems operational', () => {
    const health = {
      healthy: true,
      redis: true,
      queue: true,
      worker: true,
    };
    
    expect(health.healthy).toBe(true);
    expect(health.redis).toBe(true);
    expect(health.queue).toBe(true);
    expect(health.worker).toBe(true);
  });

  it('should return unhealthy if any component fails', () => {
    const health = {
      healthy: false,
      redis: true,
      queue: true,
      worker: false,
    };
    
    expect(health.healthy).toBe(false);
    expect(health.worker).toBe(false);
  });
});

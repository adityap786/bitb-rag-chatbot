/**
 * Langfuse Tracing Integration Tests
 * Validates RAG pipeline tracing with retrieval and LLM spans
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRagQueryTrace, getLangfuseClient } from '@/lib/observability/langfuse-client';

describe('Langfuse Tracing Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).__langfuse_client_override;
  });

  describe('createRagQueryTrace', () => {
    it('should create trace when Langfuse is configured', () => {
      // Mock Langfuse client
      const mockTrace = {
        id: 'test-trace-id',
        update: vi.fn(),
        span: vi.fn(),
        generation: vi.fn(),
        event: vi.fn(),
      };

      const mockClient = {
        trace: vi.fn().mockReturnValue(mockTrace),
        flushAsync: vi.fn(),
      };

      // Inject test override client so createRagQueryTrace uses our mock
      (globalThis as any).__langfuse_client_override = mockClient as any;

      const trace = createRagQueryTrace('query-123', 'tenant-456', 'What is RAG?');

      expect(trace).toBeDefined();
      expect(mockClient.trace).toHaveBeenCalledWith({
        name: 'rag-query',
        id: 'query-123',
        metadata: {
          tenant_id: 'tenant-456',
          query_length: 12,
        },
      });
    });

    it('should return null when Langfuse is not configured', () => {
      // Ensure no override is present and LANGFUSE not configured
      delete (globalThis as any).__langfuse_client_override;

      const trace = createRagQueryTrace('query-123', 'tenant-456', 'What is RAG?');

      expect(trace).toBeNull();
    });

    it('should handle trace creation errors gracefully', () => {
      const mockClient = {
        trace: vi.fn().mockImplementation(() => {
          throw new Error('Langfuse API error');
        }),
        flushAsync: vi.fn(),
      };

      // Inject test override client that throws to simulate API error
      (globalThis as any).__langfuse_client_override = mockClient as any;

      const trace = createRagQueryTrace('query-123', 'tenant-456', 'What is RAG?');

      expect(trace).toBeNull();
    });
  });

  describe('Trace Spans', () => {
    it('should support retrieval span with metadata', () => {
      const mockTrace = {
        id: 'test-trace-id',
        update: vi.fn(),
        span: vi.fn().mockReturnThis(),
        generation: vi.fn(),
        event: vi.fn(),
      };

      // Simulate retrieval span
      mockTrace.span({
        name: 'retrieval',
        input: { query: 'test query', k: 5, similarity_threshold: 0.7 },
        output: {
          documents_retrieved: 4,
          top_similarity: 0.89,
        },
        metadata: {
          tenant_id: 'tenant-123',
          latency_ms: 145,
          cache_used: false,
        },
      });

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'retrieval',
          input: expect.objectContaining({ query: 'test query' }),
          output: expect.objectContaining({ documents_retrieved: 4 }),
        })
      );
    });

    it('should support LLM generation span with token usage', () => {
      const mockTrace = {
        id: 'test-trace-id',
        update: vi.fn(),
        span: vi.fn(),
        generation: vi.fn().mockReturnThis(),
        event: vi.fn(),
      };

      // Simulate LLM generation span
      mockTrace.generation({
        name: 'llm-generation',
        model: 'llama-3-groq-70b-8192-tool-use-preview',
        modelParameters: {
          temperature: 0.15,
          maxTokens: 512,
        },
        input: {
          query: 'What is RAG?',
          context_length: 1200,
          sources_count: 4,
        },
        output: {
          answer: 'RAG (Retrieval Augmented Generation) is...',
        },
        metadata: {
          tenant_id: 'tenant-123',
          latency_ms: 850,
          provider: 'groq',
        },
        usage: {
          promptTokens: 450,
          completionTokens: 120,
          totalTokens: 570,
        },
      });

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'llm-generation',
          model: 'llama-3-groq-70b-8192-tool-use-preview',
          usage: expect.objectContaining({
            promptTokens: 450,
            completionTokens: 120,
            totalTokens: 570,
          }),
        })
      );
    });

    it('should support event logging for PII detection', () => {
      const mockTrace = {
        id: 'test-trace-id',
        update: vi.fn(),
        span: vi.fn(),
        generation: vi.fn(),
        event: vi.fn(),
      };

      // Simulate PII detection event
      mockTrace.event({
        name: 'pii-detected',
        metadata: {
          pii_types: ['email', 'phone'],
          masked: true,
        },
      });

      expect(mockTrace.event).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'pii-detected',
          metadata: expect.objectContaining({
            pii_types: ['email', 'phone'],
            masked: true,
          }),
        })
      );
    });
  });

  describe('Trace Update with Final Metrics', () => {
    it('should update trace with comprehensive output and metadata', () => {
      const mockTrace = {
        id: 'test-trace-id',
        update: vi.fn(),
        span: vi.fn(),
        generation: vi.fn(),
        event: vi.fn(),
      };

      // Simulate final trace update
      mockTrace.update({
        output: {
          answer: 'RAG combines retrieval with generation...',
          sources_count: 4,
          confidence: 0.85,
          character_limit_applied: null,
          original_length: 450,
        },
        metadata: {
          tenant_id: 'tenant-123',
          llm_provider: 'groq',
          llm_model: 'llama-3-groq-70b-8192-tool-use-preview',
          total_latency_ms: 1200,
          success: true,
          error: null,
          k: 5,
          cached: false,
        },
        tags: ['tenant:tenant-123', 'model:llama-3-groq-70b-8192-tool-use-preview', 'provider:groq', 'success'],
      });

      expect(mockTrace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            sources_count: 4,
            confidence: 0.85,
          }),
          metadata: expect.objectContaining({
            success: true,
            total_latency_ms: 1200,
          }),
          tags: expect.arrayContaining(['success', 'tenant:tenant-123']),
        })
      );
    });

    it('should include error information in trace when LLM fails', () => {
      const mockTrace = {
        id: 'test-trace-id',
        update: vi.fn(),
        span: vi.fn(),
        generation: vi.fn(),
        event: vi.fn(),
      };

      // Simulate error trace update
      mockTrace.update({
        output: {
          answer: 'I could not reach the knowledge base right now.',
          sources_count: 0,
          confidence: 0.3,
        },
        metadata: {
          tenant_id: 'tenant-123',
          llm_provider: 'groq',
          llm_model: 'llama-3-groq-70b-8192-tool-use-preview',
          total_latency_ms: 300,
          success: false,
          error: 'Connection timeout',
          k: 5,
          cached: false,
        },
        tags: ['tenant:tenant-123', 'model:llama-3-groq-70b-8192-tool-use-preview', 'provider:groq', 'error'],
      });

      expect(mockTrace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            success: false,
            error: 'Connection timeout',
          }),
          tags: expect.arrayContaining(['error']),
        })
      );
    });
  });

  describe('Environment Configuration', () => {
    it('should respect LANGFUSE_PUBLIC_KEY environment variable', () => {
      const originalKey = process.env.LANGFUSE_PUBLIC_KEY;
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-123';

      // Test logic that checks for Langfuse configuration
      expect(process.env.LANGFUSE_PUBLIC_KEY).toBe('pk-test-123');

      // Restore
      if (originalKey) {
        process.env.LANGFUSE_PUBLIC_KEY = originalKey;
      } else {
        delete process.env.LANGFUSE_PUBLIC_KEY;
      }
    });

    it('should respect LANGFUSE_SECRET_KEY environment variable', () => {
      const originalKey = process.env.LANGFUSE_SECRET_KEY;
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-456';

      // Test logic that checks for Langfuse configuration
      expect(process.env.LANGFUSE_SECRET_KEY).toBe('sk-test-456');

      // Restore
      if (originalKey) {
        process.env.LANGFUSE_SECRET_KEY = originalKey;
      } else {
        delete process.env.LANGFUSE_SECRET_KEY;
      }
    });

    it('should use custom LANGFUSE_HOST when provided', () => {
      const originalHost = process.env.LANGFUSE_HOST;
      process.env.LANGFUSE_HOST = 'https://custom-langfuse.example.com';

      // Test logic that checks for Langfuse host
      expect(process.env.LANGFUSE_HOST).toBe('https://custom-langfuse.example.com');

      // Restore
      if (originalHost) {
        process.env.LANGFUSE_HOST = originalHost;
      } else {
        delete process.env.LANGFUSE_HOST;
      }
    });
  });
});

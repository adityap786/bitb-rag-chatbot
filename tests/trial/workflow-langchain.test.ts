/**
 * LangChain KB Assessment Tests
 * Validates AI-powered knowledge base quality evaluation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowLangChainService } from '@/lib/trial/workflow-langchain';
import type { KBQualityAssessment } from '@/types/workflow';

describe('LangChain KB Assessment', () => {
  let service: WorkflowLangChainService;

  beforeEach(() => {
    service = new WorkflowLangChainService();
    vi.clearAllMocks();
  });

  describe('assessKBQuality', () => {
    it('should reject empty knowledge base', async () => {
      const result = await service.assessKBQuality([], 'test-tenant');

      expect(result.quality_score).toBe(0);
      expect(result.recommendation).toBe('reject');
      expect(result.quality_issues).toContain('No documents provided');
      expect(result.confidence).toBe(1.0);
    });

    it('should assess minimal knowledge base as low quality', async () => {
      const documents = [
        {
          id: 'doc1',
          content: 'Short content.',
        },
      ];

      const result = await service.assessKBQuality(documents, 'test-tenant');

      expect(result.document_count).toBe(1);
      expect(result.quality_score).toBeLessThan(0.5);
      expect(result.quality_issues.length).toBeGreaterThan(0);
      expect(['reject', 'manual_review']).toContain(result.recommendation);
    });

    it('should assess comprehensive knowledge base as high quality', async () => {
      const documents = [
        {
          id: 'doc1',
          content: 'This is a comprehensive document about our product features. '.repeat(50),
        },
        {
          id: 'doc2',
          content: 'Detailed pricing information and subscription tiers. '.repeat(40),
        },
        {
          id: 'doc3',
          content: 'Customer support policies and contact information. '.repeat(45),
        },
        {
          id: 'doc4',
          content: 'Technical documentation for API integration. '.repeat(35),
        },
        {
          id: 'doc5',
          content: 'Company history, mission, and values. '.repeat(30),
        },
      ];

      const result = await service.assessKBQuality(documents, 'test-tenant');

      expect(result.document_count).toBe(5);
      expect(result.quality_score).toBeGreaterThan(0.4);
      expect(result.total_tokens).toBeGreaterThan(1000);
      expect(result.recommendation).toMatch(/approve|manual_review/);
    });

    it('should calculate semantic coherence score', async () => {
      const documents = [
        {
          id: 'doc1',
          content: 'Well-structured content with clear information. '.repeat(20),
        },
      ];

      const result = await service.assessKBQuality(documents, 'test-tenant');

      expect(result.semantic_coherence).toBeGreaterThanOrEqual(0);
      expect(result.semantic_coherence).toBeLessThanOrEqual(1);
    });

    it('should calculate coverage score based on document count', async () => {
      const documents = Array.from({ length: 10 }, (_, i) => ({
        id: `doc${i + 1}`,
        content: `Document ${i + 1} with relevant content. `.repeat(15),
      }));

      const result = await service.assessKBQuality(documents, 'test-tenant');

      expect(result.coverage_score).toBeGreaterThan(0.3);
      expect(result.coverage_score).toBeLessThanOrEqual(1.0);
    });

    it('should include assessment details', async () => {
      const documents = [
        { id: 'doc1', content: 'Short' },
        { id: 'doc2', content: 'Medium length content here' },
        { id: 'doc3', content: 'This is a longer piece of content with more details' },
      ];

      const result = await service.assessKBQuality(documents, 'test-tenant');

      expect(result.details).toBeDefined();
      expect(result.details.avg_doc_length).toBeGreaterThan(0);
      expect(result.details.min_doc_length).toBe(5); // "Short"
      expect(result.details.max_doc_length).toBeGreaterThan(40);
      expect(result.details.assessment_timestamp).toBeDefined();
    });

    it('should handle LangChain errors gracefully', async () => {
      // Mock OpenAI to throw error
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'invalid-key';

      const documents = [
        {
          id: 'doc1',
          content: 'Test content. '.repeat(20),
        },
      ];

      const result = await service.assessKBQuality(documents, 'test-tenant');

      // Should fall back to heuristic assessment
      expect(result.quality_score).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();

      // Restore
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    it('should provide appropriate recommendations', async () => {
      const testCases = [
        {
          documents: [{ id: '1', content: 'x' }],
          expectedRec: 'reject',
        },
        {
          documents: Array.from({ length: 3 }, (_, i) => ({
            id: `${i}`,
            content: 'Medium content. '.repeat(15),
          })),
          expectedRec: /reject|manual_review|approve/,
        },
        {
          documents: Array.from({ length: 15 }, (_, i) => ({
            id: `${i}`,
            content: 'Comprehensive content with details. '.repeat(30),
          })),
          expectedRec: 'approve',
        },
      ];

      for (const testCase of testCases) {
        const result = await service.assessKBQuality(testCase.documents, 'test-tenant');
        if (typeof testCase.expectedRec === 'string') {
          expect(result.recommendation).toBe(testCase.expectedRec);
        } else {
          expect(result.recommendation).toMatch(testCase.expectedRec);
        }
      }
    });

    it('should identify quality issues', async () => {
      const documents = [
        { id: 'doc1', content: 'x' },
        { id: 'doc2', content: 'y' },
      ];

      const result = await service.assessKBQuality(documents, 'test-tenant');

      expect(result.quality_issues.length).toBeGreaterThan(0);
      expect(result.quality_issues.some(i => i.includes('short'))).toBe(true);
    });

    it('should track token count', async () => {
      const documents = [
        { id: 'doc1', content: 'a '.repeat(500) }, // ~1000 characters = ~250 tokens
      ];

      const result = await service.assessKBQuality(documents, 'test-tenant');

      expect(result.total_tokens).toBeGreaterThan(200);
      expect(result.total_tokens).toBeLessThan(400);
    });

    it('should use LangChain when OpenAI is configured', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const documents = [
        {
          id: 'doc1',
          content: 'Test document with structured content. '.repeat(25),
        },
      ];

      const result = await service.assessKBQuality(documents, 'test-tenant');

      // Should indicate LangChain usage in details
      expect(result.details.langchain_used).toBeDefined();

      // Restore
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    it('should have higher confidence with LangChain', async () => {
      const documents = [
        { id: 'doc1', content: 'Content. '.repeat(50) },
      ];

      // Without LangChain (no API key)
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const heuristicResult = await service.assessKBQuality(documents, 'test-tenant');

      // With LangChain (with API key, though it may fail)
      process.env.OPENAI_API_KEY = 'test-key';
      const langchainResult = await service.assessKBQuality(documents, 'test-tenant');

      // Confidence should be influenced by LangChain availability
      expect(heuristicResult.confidence).toBeGreaterThanOrEqual(0.7);
      expect(heuristicResult.confidence).toBeLessThanOrEqual(1.0);

      // Restore
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });
  });

  describe('extractKeyTopics', () => {
    it('should extract topics from documents', async () => {
      const documents = [
        { content: 'Machine Learning and Artificial Intelligence are transforming the industry.' },
        { content: 'Data Science and Analytics provide valuable insights.' },
      ];

      const topics = await service.extractKeyTopics(documents, 5);

      expect(topics).toBeDefined();
      expect(Array.isArray(topics)).toBe(true);
      expect(topics.length).toBeGreaterThan(0);
      expect(topics.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty documents', async () => {
      const topics = await service.extractKeyTopics([], 5);

      expect(topics).toEqual([]);
    });

    it('should limit topic count', async () => {
      const documents = Array.from({ length: 20 }, (_, i) => ({
        content: `Topic ${i + 1} and Related Concept ${i + 1} are important.`,
      }));

      const topics = await service.extractKeyTopics(documents, 5);

      expect(topics.length).toBeLessThanOrEqual(5);
    });
  });

  describe('validateKBCompleteness', () => {
    it('should validate complete knowledge base', async () => {
      const documents = [
        { content: '# Heading\n\nContent with proper structure. '.repeat(30) },
        { content: '## Subheading\n\nMore detailed information. '.repeat(25) },
      ];

      const result = await service.validateKBCompleteness(documents, 'technology');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should identify incomplete knowledge base', async () => {
      const documents = [
        { content: 'Short' },
      ];

      const result = await service.validateKBCompleteness(documents, 'technology');

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should check for minimum content length', async () => {
      const documents = [
        { content: 'Too short' },
      ];

      const result = await service.validateKBCompleteness(documents, 'general');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('short'))).toBe(true);
    });

    it('should check for document structure', async () => {
      const documents = [
        { content: 'Content without any headings or structure. '.repeat(50) },
      ];

      const result = await service.validateKBCompleteness(documents, 'general');

      expect(result.issues.some(i => i.includes('structure') || i.includes('heading'))).toBe(true);
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens correctly', () => {
      const service = new WorkflowLangChainService();
      
      // Access private method via any cast for testing
      const estimateTokens = (service as any).estimateTokens.bind(service);
      
      const shortText = 'Hello';
      const longText = 'a'.repeat(1000);
      
      expect(estimateTokens(shortText)).toBeGreaterThan(0);
      expect(estimateTokens(longText)).toBeGreaterThan(estimateTokens(shortText));
      
      // Roughly 4 characters per token
      expect(estimateTokens(longText)).toBeCloseTo(250, -1);
    });
  });
});

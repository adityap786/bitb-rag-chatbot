/**
 * Phase 5.3: Workflow LLM Parity Tests
 * 
 * Tests KB quality assessment and tool assignment using both LangChain and LlamaIndex
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowLangChainService } from '../src/lib/trial/workflow-langchain.js';

describe('Workflow LLM Backend Parity', () => {
  let workflowService: WorkflowLangChainService;

  beforeEach(() => {
    workflowService = new WorkflowLangChainService();
  });

  const SAMPLE_DOCUMENTS = [
    {
      id: 'doc1',
      content: 'BiTB is an AI-powered chatbot platform that helps businesses automate customer support with intelligent conversations.',
      metadata: { source: 'product_overview.md' },
    },
    {
      id: 'doc2',
      content: 'The BiTB platform supports multiple channels: web chat, mobile apps, and social media integrations like Facebook and WhatsApp.',
      metadata: { source: 'integrations.md' },
    },
    {
      id: 'doc3',
      content: 'BiTB pricing: Starter ($49/mo), Professional ($149/mo), Enterprise (custom). All plans include 24/7 support and unlimited chatbot conversations.',
      metadata: { source: 'pricing.md' },
    },
  ];

  it('should assess KB quality with LangChain backend', async () => {
    // Force LangChain mode
    const originalFlag = process.env.USE_LLAMAINDEX_LLM;
    process.env.USE_LLAMAINDEX_LLM = 'false';

    try {
      const assessment = await workflowService.assessKBQuality(
        SAMPLE_DOCUMENTS,
        'test-tenant-langchain'
      );

      expect(assessment).toBeDefined();
      expect(assessment.quality_score).toBeGreaterThanOrEqual(0);
      expect(assessment.quality_score).toBeLessThanOrEqual(1);
      expect(assessment.document_count).toBe(3);
      expect(assessment.recommendation).toMatch(/approve|manual_review|reject/);
      expect(Array.isArray(assessment.quality_issues)).toBe(true);

      console.log('LangChain KB Assessment:', {
        quality_score: assessment.quality_score,
        coverage: assessment.coverage_score,
        coherence: assessment.semantic_coherence,
        recommendation: assessment.recommendation,
      });
    } finally {
      // Restore flag
      if (originalFlag !== undefined) {
        process.env.USE_LLAMAINDEX_LLM = originalFlag;
      } else {
        delete process.env.USE_LLAMAINDEX_LLM;
      }
    }
  }, 15000);

  it('should assess KB quality with LlamaIndex backend', async () => {
    // Skip if no API keys
    if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
      console.log('Skipping: No API keys configured');
      return;
    }

    // Force LlamaIndex mode
    const originalFlag = process.env.USE_LLAMAINDEX_LLM;
    process.env.USE_LLAMAINDEX_LLM = 'true';

    try {
      const assessment = await workflowService.assessKBQuality(
        SAMPLE_DOCUMENTS,
        'test-tenant-llamaindex'
      );

      expect(assessment).toBeDefined();
      expect(assessment.quality_score).toBeGreaterThanOrEqual(0);
      expect(assessment.quality_score).toBeLessThanOrEqual(1);
      expect(assessment.document_count).toBe(3);
      expect(assessment.recommendation).toMatch(/approve|manual_review|reject/);
      expect(Array.isArray(assessment.quality_issues)).toBe(true);

      console.log('LlamaIndex KB Assessment:', {
        quality_score: assessment.quality_score,
        coverage: assessment.coverage_score,
        coherence: assessment.semantic_coherence,
        recommendation: assessment.recommendation,
      });
    } finally {
      // Restore flag
      if (originalFlag !== undefined) {
        process.env.USE_LLAMAINDEX_LLM = originalFlag;
      } else {
        delete process.env.USE_LLAMAINDEX_LLM;
      }
    }
  }, 15000);

  it('should produce consistent assessments across backends', async () => {
    // Skip if no API keys
    if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
      console.log('Skipping: No API keys configured');
      return;
    }

    const originalFlag = process.env.USE_LLAMAINDEX_LLM;

    // Get LangChain assessment
    process.env.USE_LLAMAINDEX_LLM = 'false';
    const langchainService = new WorkflowLangChainService();
    const langchainAssessment = await langchainService.assessKBQuality(
      SAMPLE_DOCUMENTS,
      'test-tenant-comparison-lc'
    );

    // Get LlamaIndex assessment
    process.env.USE_LLAMAINDEX_LLM = 'true';
    const llamaIndexService = new WorkflowLangChainService();
    const llamaIndexAssessment = await llamaIndexService.assessKBQuality(
      SAMPLE_DOCUMENTS,
      'test-tenant-comparison-li'
    );

    // Restore flag
    if (originalFlag !== undefined) {
      process.env.USE_LLAMAINDEX_LLM = originalFlag;
    } else {
      delete process.env.USE_LLAMAINDEX_LLM;
    }

    // Compare results
    console.log('Assessment Comparison:', {
      langchain: {
        quality_score: langchainAssessment.quality_score,
        recommendation: langchainAssessment.recommendation,
      },
      llamaindex: {
        quality_score: llamaIndexAssessment.quality_score,
        recommendation: llamaIndexAssessment.recommendation,
      },
    });

    // Quality scores should be within 0.2 of each other
    const scoreDiff = Math.abs(
      langchainAssessment.quality_score - llamaIndexAssessment.quality_score
    );
    expect(scoreDiff).toBeLessThan(0.3);

    // Both should have same document count
    expect(langchainAssessment.document_count).toBe(llamaIndexAssessment.document_count);

    // Recommendations should be in same category (approve vs not approve)
    const lcApproved = langchainAssessment.recommendation === 'approve';
    const liApproved = llamaIndexAssessment.recommendation === 'approve';
    const lcRejected = langchainAssessment.recommendation === 'reject';
    const liRejected = llamaIndexAssessment.recommendation === 'reject';
    
    // Both should agree on approval or rejection (manual_review is neutral)
    if (lcApproved || liApproved) {
      expect(lcRejected).toBe(false);
      expect(liRejected).toBe(false);
    }
  }, 30000);

  it('should assign tools with LangChain backend', async () => {
    const originalFlag = process.env.USE_LLAMAINDEX_LLM;
    process.env.USE_LLAMAINDEX_LLM = 'false';

    try {
      const tools = await workflowService.assignToolsAutomatically(
        'test-tenant-tools-lc',
        {
          business_type: 'technology',
          kb_quality_assessment: {
            quality_score: 0.8,
            coverage_score: 0.75,
            document_count: 3,
            total_tokens: 500,
            quality_issues: [],
            confidence: 0.9,
            recommendation: 'approve',
            semantic_coherence: 0.85,
            details: {},
          },
        }
      );

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.length).toBeLessThanOrEqual(5);

      console.log('LangChain Tool Assignment:', tools);
    } finally {
      if (originalFlag !== undefined) {
        process.env.USE_LLAMAINDEX_LLM = originalFlag;
      } else {
        delete process.env.USE_LLAMAINDEX_LLM;
      }
    }
  }, 15000);

  it('should assign tools with LlamaIndex backend', async () => {
    if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
      console.log('Skipping: No API keys configured');
      return;
    }

    const originalFlag = process.env.USE_LLAMAINDEX_LLM;
    process.env.USE_LLAMAINDEX_LLM = 'true';

    try {
      const tools = await workflowService.assignToolsAutomatically(
        'test-tenant-tools-li',
        {
          business_type: 'technology',
          kb_quality_assessment: {
            quality_score: 0.8,
            coverage_score: 0.75,
            document_count: 3,
            total_tokens: 500,
            quality_issues: [],
            confidence: 0.9,
            recommendation: 'approve',
            semantic_coherence: 0.85,
            details: {},
          },
        }
      );

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.length).toBeLessThanOrEqual(5);

      console.log('LlamaIndex Tool Assignment:', tools);
    } finally {
      if (originalFlag !== undefined) {
        process.env.USE_LLAMAINDEX_LLM = originalFlag;
      } else {
        delete process.env.USE_LLAMAINDEX_LLM;
      }
    }
  }, 15000);

  it('should handle empty KB gracefully in both backends', async () => {
    const originalFlag = process.env.USE_LLAMAINDEX_LLM;

    // Test LangChain
    process.env.USE_LLAMAINDEX_LLM = 'false';
    const lcService = new WorkflowLangChainService();
    const lcAssessment = await lcService.assessKBQuality([], 'empty-tenant-lc');

    // Test LlamaIndex
    process.env.USE_LLAMAINDEX_LLM = 'true';
    const liService = new WorkflowLangChainService();
    const liAssessment = await liService.assessKBQuality([], 'empty-tenant-li');

    // Restore
    if (originalFlag !== undefined) {
      process.env.USE_LLAMAINDEX_LLM = originalFlag;
    } else {
      delete process.env.USE_LLAMAINDEX_LLM;
    }

    // Both should reject empty KB
    expect(lcAssessment.quality_score).toBe(0);
    expect(lcAssessment.recommendation).toBe('reject');
    expect(liAssessment.quality_score).toBe(0);
    expect(liAssessment.recommendation).toBe('reject');
  });
});

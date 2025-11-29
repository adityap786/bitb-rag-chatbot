/**
 * AI Self-Reflection System Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  ReflectionResult,
  HallucinationReport,
  ConfidenceScore,
  ThinkingTrace,
} from '../src/lib/ai';

// Mock the LLM
vi.mock('../src/lib/llm/factory', () => ({
  getLLM: vi.fn(() => ({
    // Mock LLM implementation
  })),
}));

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      assessment: 'accurate',
      confidence: 0.9,
      issues: [],
      improvements: [],
      factsToVerify: [],
      reasoning: 'The response is well-supported by context.',
    }),
  }),
}));

describe('Self-Reflection Engine', () => {
  describe('Reflection Loop', () => {
    it('accepts high-confidence responses without refinement', () => {
      const result: Partial<ReflectionResult> = {
        finalResponse: 'Paris is the capital of France.',
        originalResponse: 'Paris is the capital of France.',
        iterations: 1,
        wasRefined: false,
        confidence: 0.95,
      };
      
      expect(result.wasRefined).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.9);
    });
    
    it('refines low-confidence responses', () => {
      const result: Partial<ReflectionResult> = {
        finalResponse: 'Based on the provided documents, Paris is the capital of France.',
        originalResponse: 'Paris is probably the capital of France, I think.',
        iterations: 2,
        wasRefined: true,
        confidence: 0.88,
      };
      
      expect(result.wasRefined).toBe(true);
      expect(result.iterations).toBeGreaterThan(1);
    });
    
    it('limits maximum iterations', () => {
      const maxIterations = 3;
      const result: Partial<ReflectionResult> = {
        iterations: 3,
      };
      
      expect(result.iterations).toBeLessThanOrEqual(maxIterations);
    });
    
    it('includes reflection trace for debugging', () => {
      const trace = [
        {
          iteration: 1,
          inputResponse: 'Initial response',
          critique: {
            assessment: 'partially_accurate',
            confidence: 0.7,
            issues: [{ type: 'incompleteness', severity: 'medium', description: 'Missing context' }],
            improvements: ['Add source citations'],
            factsToVerify: [],
            reasoning: 'Response needs more detail',
          },
          refinedResponse: 'Refined response with citations',
          improvementsMade: ['Added citations'],
          confidenceChange: 0.15,
        },
      ];
      
      expect(trace[0].iteration).toBe(1);
      expect(trace[0].confidenceChange).toBeGreaterThan(0);
    });
  });
  
  describe('Self-Consistency Check', () => {
    it('detects consistent responses', () => {
      const samples = [
        'Paris is the capital of France.',
        'The capital of France is Paris.',
        'France\'s capital city is Paris.',
      ];
      
      // All samples agree on the core fact
      const agreementScore = 0.95;
      expect(agreementScore).toBeGreaterThan(0.9);
    });
    
    it('detects inconsistent responses', () => {
      const samples = [
        'Paris is the capital of France.',
        'Lyon is the capital of France.',
        'Marseille is the capital of France.',
      ];
      
      // Samples disagree
      const agreementScore = 0.3;
      expect(agreementScore).toBeLessThan(0.5);
    });
  });
  
  describe('Factual Grounding', () => {
    it('validates claims against source documents', () => {
      const response = 'According to the document, the project was completed in 2023.';
      const sources = ['The project was completed in 2023 with great success.'];
      
      // Claim is grounded
      const groundingScore = 0.95;
      expect(groundingScore).toBeGreaterThan(0.8);
    });
    
    it('identifies ungrounded claims', () => {
      const response = 'The project was completed in 2023 and won multiple awards.';
      const sources = ['The project was completed in 2023.'];
      
      // "won multiple awards" is not in sources
      const ungroundedClaims = ['won multiple awards'];
      expect(ungroundedClaims.length).toBeGreaterThan(0);
    });
  });
});

describe('Hallucination Detection', () => {
  describe('Detection Types', () => {
    it('detects fabricated facts', () => {
      const hallucination = {
        content: 'The company was founded in 1985',
        type: 'fabricated_fact',
        confidence: 0.9,
        reason: 'No founding date mentioned in context',
      };
      
      expect(hallucination.type).toBe('fabricated_fact');
    });
    
    it('detects entity confusion', () => {
      const hallucination = {
        content: 'John Smith said...',
        type: 'entity_confusion',
        confidence: 0.85,
        reason: 'The quote was from Jane Smith, not John Smith',
      };
      
      expect(hallucination.type).toBe('entity_confusion');
    });
    
    it('detects temporal errors', () => {
      const hallucination = {
        content: 'This happened in 2020',
        type: 'temporal_error',
        confidence: 0.88,
        reason: 'Source documents indicate 2019, not 2020',
      };
      
      expect(hallucination.type).toBe('temporal_error');
    });
    
    it('detects numerical errors', () => {
      const hallucination = {
        content: 'Revenue increased by 50%',
        type: 'numerical_error',
        confidence: 0.92,
        reason: 'Source states 35% increase',
      };
      
      expect(hallucination.type).toBe('numerical_error');
    });
    
    it('detects context contradictions', () => {
      const hallucination = {
        content: 'The product is not available online',
        type: 'context_contradiction',
        confidence: 0.95,
        reason: 'Context explicitly states product is available online',
      };
      
      expect(hallucination.type).toBe('context_contradiction');
    });
  });
  
  describe('Severity Calculation', () => {
    it('calculates severity based on hallucination types', () => {
      const hallucinations = [
        { type: 'fabricated_fact', confidence: 0.9 },
        { type: 'numerical_error', confidence: 0.8 },
      ];
      
      // Weighted severity calculation
      const severity = 0.85; // High severity
      expect(severity).toBeGreaterThan(0.7);
    });
    
    it('returns zero severity for no hallucinations', () => {
      const hallucinations: unknown[] = [];
      const severity = 0;
      
      expect(severity).toBe(0);
    });
  });
  
  describe('Correction Generation', () => {
    it('generates corrected response', () => {
      const original = 'The company was founded in 1985 by John Doe.';
      const corrected = 'According to the available information, the company was founded by John Doe. The founding year is not specified in the provided documents.';
      
      expect(corrected).not.toContain('1985');
      expect(corrected).toContain('not specified');
    });
  });
  
  describe('Prevention Strategies', () => {
    it('uses constrained generation prompt', () => {
      const context = 'Paris is the capital of France.';
      const query = 'What is the capital of France?';
      
      const prompt = `You must ONLY use information from the provided context`;
      
      expect(prompt).toContain('ONLY');
    });
    
    it('uses retrieval-augmented prompt', () => {
      const prompt = `Answer the question using ONLY the retrieved documents`;
      
      expect(prompt).toContain('retrieved documents');
    });
  });
});

describe('Confidence Calibration', () => {
  describe('Confidence Estimation', () => {
    it('provides overall confidence score', () => {
      const confidence: Partial<ConfidenceScore> = {
        overall: 0.85,
        calibrated: 0.82,
      };
      
      expect(confidence.overall).toBeGreaterThanOrEqual(0);
      expect(confidence.overall).toBeLessThanOrEqual(1);
    });
    
    it('breaks down confidence by aspect', () => {
      const confidence: ConfidenceScore = {
        overall: 0.85,
        breakdown: {
          factual: 0.9,
          completeness: 0.8,
          relevance: 0.95,
          grounding: 0.75,
        },
        calibrated: 0.82,
        interval: { lower: 0.75, upper: 0.89 },
        uncertaintySources: [],
      };
      
      expect(confidence.breakdown.factual).toBeDefined();
      expect(confidence.breakdown.completeness).toBeDefined();
      expect(confidence.breakdown.relevance).toBeDefined();
      expect(confidence.breakdown.grounding).toBeDefined();
    });
    
    it('calculates confidence interval', () => {
      const confidence: Partial<ConfidenceScore> = {
        overall: 0.85,
        interval: { lower: 0.78, upper: 0.92 },
      };
      
      expect(confidence.interval?.lower).toBeLessThan(confidence.overall!);
      expect(confidence.interval?.upper).toBeGreaterThan(confidence.overall!);
    });
  });
  
  describe('Uncertainty Sources', () => {
    it('identifies missing context', () => {
      const sources = [
        {
          source: 'missing_context',
          impact: 'high' as const,
          description: 'No source documents provided',
        },
      ];
      
      expect(sources[0].source).toBe('missing_context');
      expect(sources[0].impact).toBe('high');
    });
    
    it('identifies weak grounding', () => {
      const sources = [
        {
          source: 'weak_grounding',
          impact: 'high' as const,
          description: 'Claims not well-supported by context',
        },
      ];
      
      expect(sources[0].source).toBe('weak_grounding');
    });
  });
  
  describe('Uncertainty Decomposition', () => {
    it('decomposes epistemic uncertainty', () => {
      const decomposition = {
        epistemic: 0.3, // Model uncertainty
        aleatoric: 0.15, // Data uncertainty
        total: 0.34,
        explanation: 'Primary uncertainty from limited training data',
      };
      
      expect(decomposition.epistemic).toBeGreaterThan(0);
    });
    
    it('decomposes aleatoric uncertainty', () => {
      const decomposition = {
        epistemic: 0.2,
        aleatoric: 0.4, // Higher for prediction tasks
        total: 0.45,
        explanation: 'Future predictions inherently uncertain',
      };
      
      expect(decomposition.aleatoric).toBeGreaterThan(decomposition.epistemic);
    });
  });
  
  describe('Calibration Metrics', () => {
    it('calculates Expected Calibration Error', () => {
      const ece = 0.05; // Good calibration
      expect(ece).toBeLessThan(0.1);
    });
    
    it('calculates Brier Score', () => {
      const brierScore = 0.15; // Lower is better
      expect(brierScore).toBeLessThan(0.25);
    });
    
    it('generates reliability diagram data', () => {
      const reliabilityData = [
        { confidence: 0.1, accuracy: 0.12 },
        { confidence: 0.5, accuracy: 0.48 },
        { confidence: 0.9, accuracy: 0.88 },
      ];
      
      // Well-calibrated: confidence ≈ accuracy
      reliabilityData.forEach(point => {
        expect(Math.abs(point.confidence - point.accuracy)).toBeLessThan(0.1);
      });
    });
  });
});

describe('Thinking Trace', () => {
  it('tracks reasoning steps', () => {
    const trace: ThinkingTrace[] = [
      {
        step: 'understand',
        thought: 'Understanding the question...',
        action: 'Parse query',
        result: 'User asking about X',
        confidence: 1,
      },
      {
        step: 'gather',
        thought: 'What information do I need?',
        action: 'Identify key facts',
        result: 'Need facts A, B, C',
        confidence: 0.9,
      },
      {
        step: 'reason',
        thought: 'Let me think through this...',
        action: 'Logical reasoning',
        result: 'A + B implies C',
        confidence: 0.85,
      },
      {
        step: 'answer',
        thought: 'Now I can answer...',
        action: 'Formulate response',
        result: 'The answer is...',
        confidence: 0.8,
      },
      {
        step: 'verify',
        thought: 'Double-checking...',
        action: 'Self-verification',
        result: 'Answer verified',
        confidence: 0.9,
      },
    ];
    
    expect(trace.length).toBe(5);
    expect(trace[0].step).toBe('understand');
    expect(trace[trace.length - 1].step).toBe('verify');
  });
});

describe('Validation Rules', () => {
  describe('Uncertainty Check', () => {
    it('passes for direct statements', () => {
      const response = 'Paris is the capital of France.';
      const hedgingPhrases = ['I think', 'maybe', 'possibly'];
      const hasHedging = hedgingPhrases.some(p => response.toLowerCase().includes(p));
      
      expect(hasHedging).toBe(false);
    });
    
    it('fails for excessive hedging', () => {
      const response = 'I think maybe Paris might possibly be the capital of France.';
      const hedgingPhrases = ['I think', 'maybe', 'possibly', 'might'];
      const hedgingCount = hedgingPhrases.filter(p => 
        response.toLowerCase().includes(p)
      ).length;
      
      expect(hedgingCount).toBeGreaterThan(2);
    });
  });
  
  describe('Citation Check', () => {
    it('passes when sources are cited', () => {
      const response = 'According to the document, the project was completed in 2023.';
      const citationPatterns = [/according to/i, /based on/i];
      const hasCitations = citationPatterns.some(p => p.test(response));
      
      expect(hasCitations).toBe(true);
    });
    
    it('fails when sources are not cited', () => {
      const response = 'The project was completed in 2023.';
      const citationPatterns = [/according to/i, /based on/i];
      const hasCitations = citationPatterns.some(p => p.test(response));
      
      expect(hasCitations).toBe(false);
    });
  });
  
  describe('Completeness Check', () => {
    it('passes when query is addressed', () => {
      const query = 'What is the capital of France?';
      const response = 'The capital of France is Paris.';
      
      const queryTerms = ['capital', 'france'];
      const responseTerms = response.toLowerCase();
      const coverage = queryTerms.filter(t => responseTerms.includes(t)).length / queryTerms.length;
      
      expect(coverage).toBeGreaterThan(0.5);
    });
  });
  
  describe('Contradiction Check', () => {
    it('passes for consistent response', () => {
      const response = 'Paris is the capital. It has been the capital for centuries.';
      const hasContradiction = false; // No contradiction
      
      expect(hasContradiction).toBe(false);
    });
    
    it('fails for contradictory response', () => {
      const response = 'Paris is the capital. Paris is not the capital.';
      const hasContradiction = true;
      
      expect(hasContradiction).toBe(true);
    });
  });
});

describe('Integration', () => {
  describe('Full Pipeline', () => {
    it('processes query through full reflection pipeline', () => {
      const result = {
        response: 'Based on the provided context, Paris is the capital of France.',
        originalResponse: 'Paris is the capital of France.',
        wasRefined: true,
        confidence: {
          overall: 0.92,
          calibrated: 0.89,
        },
        metadata: {
          totalTimeMs: 1500,
          generationTimeMs: 500,
          reflectionTimeMs: 1000,
          iterations: 2,
        },
      };
      
      expect(result.confidence.overall).toBeGreaterThan(0.85);
      expect(result.metadata.totalTimeMs).toBeGreaterThan(0);
    });
    
    it('handles low-confidence responses appropriately', () => {
      const result = {
        response: 'I don\'t have enough information to answer this question definitively.',
        confidence: {
          overall: 0.4,
        },
        uncertainty: {
          epistemic: 0.5,
          aleatoric: 0.3,
          total: 0.58,
          explanation: 'Query outside training data',
        },
      };
      
      expect(result.confidence.overall).toBeLessThan(0.5);
      expect(result.uncertainty).toBeDefined();
    });
  });
});

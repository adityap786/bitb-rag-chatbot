/**
 * AI Self-Reflection System
 * 
 * Implements reflection loops to reduce hallucinations and improve output quality.
 * Mimics human thought processes: Generate → Critique → Refine → Validate
 * 
 * Key Techniques:
 * 1. Chain-of-Thought Verification
 * 2. Self-Consistency Checking
 * 3. Factual Grounding Validation
 * 4. Confidence Calibration
 * 5. Iterative Refinement Loops
 */

import { generateText, type CoreMessage } from 'ai';
import { getLLM } from '@/lib/llm/factory';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ReflectionConfig {
  /** Maximum reflection iterations before accepting output */
  maxIterations: number;
  /** Minimum confidence threshold to accept output (0-1) */
  confidenceThreshold: number;
  /** Enable factual grounding check against source documents */
  enableFactualGrounding: boolean;
  /** Enable self-consistency check with multiple samples */
  enableSelfConsistency: boolean;
  /** Number of samples for self-consistency check */
  consistencySamples: number;
  /** Enable chain-of-thought reasoning */
  enableChainOfThought: boolean;
  /** Tenant ID for LLM configuration */
  tenantId: string;
  /** Model to use for reflection (can be different from generation) */
  reflectionModel?: string;
}

export interface ReflectionInput {
  /** Original user query */
  query: string;
  /** Initial AI-generated response */
  initialResponse: string;
  /** Source documents/context used for generation */
  sourceDocuments?: SourceDocument[];
  /** Conversation history for context */
  conversationHistory?: CoreMessage[];
  /** Domain-specific validation rules */
  validationRules?: ValidationRule[];
}

export interface SourceDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  relevanceScore?: number;
}

export interface ValidationRule {
  name: string;
  description: string;
  validate: (response: string, context: ReflectionInput) => Promise<ValidationResult>;
}

export interface ValidationResult {
  passed: boolean;
  reason?: string;
  suggestions?: string[];
  confidence: number;
}

export interface CritiqueResult {
  /** Overall assessment of the response */
  assessment: 'accurate' | 'partially_accurate' | 'inaccurate' | 'uncertain';
  /** Confidence in the assessment (0-1) */
  confidence: number;
  /** Identified issues */
  issues: Issue[];
  /** Suggested improvements */
  improvements: string[];
  /** Facts that need verification */
  factsToVerify: string[];
  /** Reasoning chain */
  reasoning: string;
}

export interface Issue {
  type: 'hallucination' | 'inconsistency' | 'incompleteness' | 'factual_error' | 'logical_error' | 'ambiguity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  suggestedFix?: string;
}

export interface ReflectionResult {
  /** Final refined response */
  finalResponse: string;
  /** Original response before reflection */
  originalResponse: string;
  /** Number of reflection iterations performed */
  iterations: number;
  /** Whether the response was modified */
  wasRefined: boolean;
  /** Final confidence score */
  confidence: number;
  /** Detailed reflection trace for debugging */
  reflectionTrace: ReflectionIteration[];
  /** Factual grounding results */
  groundingResults?: GroundingResult;
  /** Self-consistency results */
  consistencyResults?: ConsistencyResult;
  /** Time taken for reflection */
  processingTimeMs: number;
}

export interface ReflectionIteration {
  iteration: number;
  inputResponse: string;
  critique: CritiqueResult;
  refinedResponse: string;
  improvementsMade: string[];
  confidenceChange: number;
}

export interface GroundingResult {
  isGrounded: boolean;
  groundedClaims: GroundedClaim[];
  ungroundedClaims: string[];
  groundingScore: number;
}

export interface GroundedClaim {
  claim: string;
  supportingDocument: string;
  confidence: number;
}

export interface ConsistencyResult {
  isConsistent: boolean;
  samples: string[];
  consensusResponse: string;
  agreementScore: number;
  divergentPoints: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ReflectionConfig = {
  maxIterations: 3,
  confidenceThreshold: 0.85,
  enableFactualGrounding: true,
  enableSelfConsistency: true,
  consistencySamples: 3,
  enableChainOfThought: true,
  tenantId: 'default',
};

// ============================================================================
// Self-Reflection Engine
// ============================================================================

export class SelfReflectionEngine {
  private config: ReflectionConfig;
  
  constructor(config: Partial<ReflectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Main reflection loop - generates, critiques, and refines response
   */
  async reflect(input: ReflectionInput): Promise<ReflectionResult> {
    const startTime = Date.now();
    const reflectionTrace: ReflectionIteration[] = [];
    
    let currentResponse = input.initialResponse;
    let currentConfidence = 0;
    let iteration = 0;
    
    // Step 1: Self-Consistency Check (if enabled)
    let consistencyResults: ConsistencyResult | undefined;
    if (this.config.enableSelfConsistency) {
      consistencyResults = await this.checkSelfConsistency(input);
      if (consistencyResults.isConsistent && consistencyResults.agreementScore > 0.9) {
        currentResponse = consistencyResults.consensusResponse;
        currentConfidence = consistencyResults.agreementScore;
      }
    }
    
    // Step 2: Factual Grounding Check (if enabled)
    let groundingResults: GroundingResult | undefined;
    if (this.config.enableFactualGrounding && input.sourceDocuments?.length) {
      groundingResults = await this.checkFactualGrounding(currentResponse, input.sourceDocuments);
      if (!groundingResults.isGrounded) {
        // Flag ungrounded claims for revision
        currentConfidence = Math.min(currentConfidence, groundingResults.groundingScore);
      }
    }
    
    // Step 3: Iterative Reflection Loop
    while (iteration < this.config.maxIterations && currentConfidence < this.config.confidenceThreshold) {
      iteration++;
      
      // Critique the current response
      const critique = await this.critiqueResponse(currentResponse, input, groundingResults);
      
      // If no significant issues found, we're done
      if (critique.assessment === 'accurate' && critique.confidence >= this.config.confidenceThreshold) {
        currentConfidence = critique.confidence;
        break;
      }
      
      // Refine the response based on critique
      const refinedResponse = await this.refineResponse(currentResponse, critique, input);
      
      // Track the iteration
      reflectionTrace.push({
        iteration,
        inputResponse: currentResponse,
        critique,
        refinedResponse,
        improvementsMade: critique.improvements,
        confidenceChange: critique.confidence - currentConfidence,
      });
      
      currentResponse = refinedResponse;
      currentConfidence = critique.confidence;
      
      // Re-check grounding after refinement
      if (this.config.enableFactualGrounding && input.sourceDocuments?.length) {
        groundingResults = await this.checkFactualGrounding(currentResponse, input.sourceDocuments);
      }
    }
    
    // Step 4: Final Validation
    const finalValidation = await this.validateFinalResponse(currentResponse, input);
    currentConfidence = Math.min(currentConfidence, finalValidation.confidence);
    
    return {
      finalResponse: currentResponse,
      originalResponse: input.initialResponse,
      iterations: iteration,
      wasRefined: currentResponse !== input.initialResponse,
      confidence: currentConfidence,
      reflectionTrace,
      groundingResults,
      consistencyResults,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  /**
   * Generate multiple samples and check for consistency
   */
  private async checkSelfConsistency(input: ReflectionInput): Promise<ConsistencyResult> {
    const llm = getLLM(this.config.tenantId);
    const samples: string[] = [input.initialResponse];
    
    // Generate additional samples with temperature variation
    for (let i = 1; i < this.config.consistencySamples; i++) {
      try {
        const result = await generateText({
          model: llm,
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant. Answer the following question based on the provided context. Be accurate and concise.`,
            },
            ...(input.conversationHistory || []),
            {
              role: 'user',
              content: this.buildContextualPrompt(input),
            },
          ],
          temperature: 0.3 + (i * 0.2), // Vary temperature for diversity
        });
        samples.push(result.text);
      } catch (error) {
        console.error(`Self-consistency sample ${i} failed:`, error);
      }
    }
    
    // Analyze consistency across samples
    const consistencyAnalysis = await this.analyzeConsistency(samples, input.query);
    
    return consistencyAnalysis;
  }
  
  /**
   * Analyze consistency across multiple response samples
   */
  private async analyzeConsistency(samples: string[], query: string): Promise<ConsistencyResult> {
    const llm = getLLM(this.config.tenantId);
    
    const prompt = `Analyze the consistency of these ${samples.length} responses to the same query.

Query: "${query}"

Responses:
${samples.map((s, i) => `Response ${i + 1}: ${s}`).join('\n\n')}

Analyze:
1. Are the core facts consistent across all responses?
2. What is the consensus answer?
3. What points diverge between responses?
4. Rate the overall agreement (0-1)

Respond in JSON format:
{
  "isConsistent": boolean,
  "consensusResponse": "the most accurate and consistent answer",
  "agreementScore": 0.0-1.0,
  "divergentPoints": ["list of points where responses differ"]
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      return {
        isConsistent: parsed.isConsistent,
        samples,
        consensusResponse: parsed.consensusResponse || samples[0],
        agreementScore: parsed.agreementScore || 0.5,
        divergentPoints: parsed.divergentPoints || [],
      };
    } catch (error) {
      console.error('Consistency analysis failed:', error);
      return {
        isConsistent: true,
        samples,
        consensusResponse: samples[0],
        agreementScore: 0.7,
        divergentPoints: [],
      };
    }
  }
  
  /**
   * Check if response claims are grounded in source documents
   */
  private async checkFactualGrounding(
    response: string,
    sourceDocuments: SourceDocument[]
  ): Promise<GroundingResult> {
    const llm = getLLM(this.config.tenantId);
    
    const sourcesText = sourceDocuments
      .map((doc, i) => `[Source ${i + 1}]: ${doc.content}`)
      .join('\n\n');
    
    const prompt = `Verify if each claim in the response is supported by the source documents.

RESPONSE TO VERIFY:
${response}

SOURCE DOCUMENTS:
${sourcesText}

For each factual claim in the response:
1. Identify the claim
2. Check if it's directly supported by a source
3. Mark as grounded or ungrounded

Respond in JSON format:
{
  "groundedClaims": [
    {"claim": "claim text", "supportingDocument": "Source N", "confidence": 0.0-1.0}
  ],
  "ungroundedClaims": ["claim that has no source support"],
  "groundingScore": 0.0-1.0
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      return {
        isGrounded: parsed.groundingScore >= 0.8,
        groundedClaims: parsed.groundedClaims || [],
        ungroundedClaims: parsed.ungroundedClaims || [],
        groundingScore: parsed.groundingScore || 0.5,
      };
    } catch (error) {
      console.error('Grounding check failed:', error);
      return {
        isGrounded: true,
        groundedClaims: [],
        ungroundedClaims: [],
        groundingScore: 0.7,
      };
    }
  }
  
  /**
   * Critique the response for issues
   */
  private async critiqueResponse(
    response: string,
    input: ReflectionInput,
    groundingResults?: GroundingResult
  ): Promise<CritiqueResult> {
    const llm = getLLM(this.config.tenantId);
    
    const chainOfThoughtPrompt = this.config.enableChainOfThought
      ? `\nUse chain-of-thought reasoning to analyze step by step.`
      : '';
    
    const groundingContext = groundingResults
      ? `\nFactual Grounding Analysis:\n- Grounded claims: ${groundingResults.groundedClaims.length}\n- Ungrounded claims: ${groundingResults.ungroundedClaims.join(', ')}`
      : '';
    
    const prompt = `You are a critical evaluator. Analyze this AI-generated response for accuracy, completeness, and potential issues.${chainOfThoughtPrompt}

ORIGINAL QUERY: ${input.query}

RESPONSE TO EVALUATE:
${response}

${input.sourceDocuments?.length ? `AVAILABLE CONTEXT:\n${input.sourceDocuments.map(d => d.content).join('\n\n')}` : ''}
${groundingContext}

Evaluate the response for:
1. **Hallucinations**: Claims not supported by context or common knowledge
2. **Inconsistencies**: Contradictions within the response
3. **Incompleteness**: Missing important information
4. **Factual Errors**: Verifiably incorrect statements
5. **Logical Errors**: Flawed reasoning
6. **Ambiguity**: Unclear or vague statements

Respond in JSON format:
{
  "assessment": "accurate|partially_accurate|inaccurate|uncertain",
  "confidence": 0.0-1.0,
  "reasoning": "Step-by-step analysis of the response",
  "issues": [
    {
      "type": "hallucination|inconsistency|incompleteness|factual_error|logical_error|ambiguity",
      "severity": "low|medium|high|critical",
      "description": "Description of the issue",
      "location": "Where in the response",
      "suggestedFix": "How to fix it"
    }
  ],
  "improvements": ["List of specific improvements to make"],
  "factsToVerify": ["Claims that need external verification"]
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      return {
        assessment: parsed.assessment || 'uncertain',
        confidence: parsed.confidence || 0.5,
        issues: parsed.issues || [],
        improvements: parsed.improvements || [],
        factsToVerify: parsed.factsToVerify || [],
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      console.error('Critique failed:', error);
      return {
        assessment: 'uncertain',
        confidence: 0.5,
        issues: [],
        improvements: [],
        factsToVerify: [],
        reasoning: 'Critique generation failed',
      };
    }
  }
  
  /**
   * Refine the response based on critique
   */
  private async refineResponse(
    response: string,
    critique: CritiqueResult,
    input: ReflectionInput
  ): Promise<string> {
    const llm = getLLM(this.config.tenantId);
    
    const issuesSummary = critique.issues
      .map(i => `- [${i.severity.toUpperCase()}] ${i.type}: ${i.description}${i.suggestedFix ? ` → Fix: ${i.suggestedFix}` : ''}`)
      .join('\n');
    
    const prompt = `Revise this response to address the identified issues while maintaining accuracy.

ORIGINAL QUERY: ${input.query}

CURRENT RESPONSE:
${response}

ISSUES TO ADDRESS:
${issuesSummary || 'Minor improvements needed for clarity'}

REQUIRED IMPROVEMENTS:
${critique.improvements.map(i => `- ${i}`).join('\n') || '- Improve clarity and accuracy'}

AVAILABLE CONTEXT:
${input.sourceDocuments?.map(d => d.content).join('\n\n') || 'No additional context available'}

GUIDELINES:
1. Fix all identified issues
2. Only include information supported by the context
3. If uncertain, acknowledge limitations
4. Be concise but complete
5. Maintain a helpful, professional tone

Provide the revised response (just the response, no meta-commentary):`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      });
      
      return result.text.trim();
    } catch (error) {
      console.error('Refinement failed:', error);
      return response; // Return original if refinement fails
    }
  }
  
  /**
   * Final validation of the response
   */
  private async validateFinalResponse(
    response: string,
    input: ReflectionInput
  ): Promise<ValidationResult> {
    // Run custom validation rules if provided
    if (input.validationRules?.length) {
      const results = await Promise.all(
        input.validationRules.map(rule => rule.validate(response, input))
      );
      
      const allPassed = results.every(r => r.passed);
      const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
      
      return {
        passed: allPassed,
        confidence: avgConfidence,
        suggestions: results.flatMap(r => r.suggestions || []),
      };
    }
    
    // Default validation
    return {
      passed: true,
      confidence: 0.85,
    };
  }
  
  /**
   * Build contextual prompt with source documents
   */
  private buildContextualPrompt(input: ReflectionInput): string {
    let prompt = input.query;
    
    if (input.sourceDocuments?.length) {
      const context = input.sourceDocuments
        .map(doc => doc.content)
        .join('\n\n---\n\n');
      prompt = `Context:\n${context}\n\nQuestion: ${input.query}`;
    }
    
    return prompt;
  }
  
  /**
   * Extract JSON from potentially wrapped response
   */
  private extractJSON(text: string): string {
    // Try to find JSON in code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    
    // Try to find JSON object directly
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    
    return text;
  }
}

// ============================================================================
// Pre-built Validation Rules
// ============================================================================

export const VALIDATION_RULES = {
  /**
   * Check for hedging language that indicates uncertainty
   */
  uncertaintyCheck: {
    name: 'Uncertainty Check',
    description: 'Detects if the response contains excessive hedging',
    validate: async (response: string): Promise<ValidationResult> => {
      const hedgingPhrases = [
        'I think', 'maybe', 'possibly', 'might be', 'could be',
        'I\'m not sure', 'I believe', 'probably', 'perhaps',
        'it seems', 'appears to be', 'I guess',
      ];
      
      const matches = hedgingPhrases.filter(phrase => 
        response.toLowerCase().includes(phrase.toLowerCase())
      );
      
      const hedgingRatio = matches.length / (response.split(' ').length / 50);
      
      return {
        passed: hedgingRatio < 0.3,
        reason: hedgingRatio >= 0.3 ? 'Response contains excessive uncertainty' : undefined,
        suggestions: hedgingRatio >= 0.3 
          ? ['Consider providing more definitive answers or acknowledging knowledge gaps clearly']
          : undefined,
        confidence: 1 - hedgingRatio,
      };
    },
  },
  
  /**
   * Check for citation of sources when making claims
   */
  citationCheck: {
    name: 'Citation Check',
    description: 'Verifies that claims are properly attributed',
    validate: async (response: string, context: ReflectionInput): Promise<ValidationResult> => {
      if (!context.sourceDocuments?.length) {
        return { passed: true, confidence: 1 };
      }
      
      // Check for citation patterns
      const citationPatterns = [
        /according to/i,
        /based on/i,
        /as mentioned in/i,
        /the (?:document|source|context) (?:states|mentions|indicates)/i,
        /\[(?:source|ref).*?\]/i,
      ];
      
      const hasCitations = citationPatterns.some(pattern => pattern.test(response));
      
      return {
        passed: hasCitations || response.length < 200, // Short responses may not need citations
        reason: !hasCitations ? 'Response makes claims without citing sources' : undefined,
        suggestions: !hasCitations 
          ? ['Add references to source documents when making factual claims']
          : undefined,
        confidence: hasCitations ? 0.9 : 0.6,
      };
    },
  },
  
  /**
   * Check response length and completeness
   */
  completenessCheck: {
    name: 'Completeness Check',
    description: 'Verifies response adequately addresses the query',
    validate: async (response: string, context: ReflectionInput): Promise<ValidationResult> => {
      const queryWords = context.query.toLowerCase().split(/\s+/);
      const responseWords = response.toLowerCase().split(/\s+/);
      
      // Check if key query terms appear in response
      const keyTerms = queryWords.filter(w => w.length > 4);
      const coveredTerms = keyTerms.filter(term => 
        responseWords.some(w => w.includes(term) || term.includes(w))
      );
      
      const coverage = keyTerms.length > 0 
        ? coveredTerms.length / keyTerms.length 
        : 1;
      
      return {
        passed: coverage > 0.5,
        reason: coverage <= 0.5 ? 'Response may not fully address the query' : undefined,
        suggestions: coverage <= 0.5 
          ? [`Consider addressing these aspects: ${keyTerms.filter(t => !coveredTerms.includes(t)).join(', ')}`]
          : undefined,
        confidence: coverage,
      };
    },
  },
  
  /**
   * Check for contradictions within the response
   */
  contradictionCheck: {
    name: 'Contradiction Check',
    description: 'Detects self-contradictions in the response',
    validate: async (response: string): Promise<ValidationResult> => {
      const contradictionPatterns = [
        /but (?:also|however|on the other hand)/i,
        /(?:yes|no).*(?:but|however).*(?:yes|no)/i,
      ];
      
      const sentences = response.split(/[.!?]+/).filter(s => s.trim());
      
      // Simple heuristic: check for negation pairs
      const hasContradiction = sentences.some((s1, i) => 
        sentences.slice(i + 1).some(s2 => {
          const s1Words = new Set(s1.toLowerCase().split(/\s+/));
          const s2Words = new Set(s2.toLowerCase().split(/\s+/));
          const overlap = [...s1Words].filter(w => s2Words.has(w));
          
          // Check if one negates what the other affirms
          const s1HasNot = s1.toLowerCase().includes(' not ') || s1.toLowerCase().includes("n't");
          const s2HasNot = s2.toLowerCase().includes(' not ') || s2.toLowerCase().includes("n't");
          
          return overlap.length > 3 && s1HasNot !== s2HasNot;
        })
      );
      
      return {
        passed: !hasContradiction,
        reason: hasContradiction ? 'Response may contain contradictory statements' : undefined,
        confidence: hasContradiction ? 0.6 : 0.9,
      };
    },
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a configured self-reflection engine
 */
export function createReflectionEngine(
  tenantId: string,
  options: Partial<ReflectionConfig> = {}
): SelfReflectionEngine {
  return new SelfReflectionEngine({
    tenantId,
    ...options,
  });
}

/**
 * Quick reflection for simple use cases
 */
export async function reflectOnResponse(
  query: string,
  response: string,
  sourceDocuments?: SourceDocument[],
  tenantId: string = 'default'
): Promise<ReflectionResult> {
  const engine = createReflectionEngine(tenantId);
  return engine.reflect({
    query,
    initialResponse: response,
    sourceDocuments,
  });
}

/**
 * Add reflection to existing RAG pipeline
 */
export function withReflection<T extends { response: string; query: string; sources?: SourceDocument[] }>(
  ragFunction: (...args: unknown[]) => Promise<T>,
  reflectionConfig?: Partial<ReflectionConfig>
): (...args: unknown[]) => Promise<T & { reflection: ReflectionResult }> {
  return async (...args: unknown[]) => {
    const result = await ragFunction(...args);
    
    const engine = createReflectionEngine(
      reflectionConfig?.tenantId || 'default',
      reflectionConfig
    );
    
    const reflection = await engine.reflect({
      query: result.query,
      initialResponse: result.response,
      sourceDocuments: result.sources,
    });
    
    return {
      ...result,
      response: reflection.finalResponse,
      reflection,
    };
  };
}

export default SelfReflectionEngine;

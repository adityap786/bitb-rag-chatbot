/**
 * AI Reflection System
 * 
 * Unified module for AI self-reflection, hallucination prevention,
 * and confidence calibration. Implements human-like thought processes
 * to improve AI output quality.
 * 
 * @example
 * ```typescript
 * import { ReflectiveAI } from '@/lib/ai';
 * 
 * const ai = new ReflectiveAI({ tenantId: 'my-tenant' });
 * 
 * const result = await ai.generateWithReflection({
 *   query: "What is the capital of France?",
 *   context: ["Paris is the capital of France."],
 * });
 * 
 * console.log(result.response);         // The verified response
 * console.log(result.confidence);       // Calibrated confidence score
 * console.log(result.wasRefined);       // Whether reflection improved it
 * ```
 */

import { generateText, type CoreMessage } from 'ai';
import { getLLM } from '@/lib/llm/factory';

import {
  SelfReflectionEngine,
  type ReflectionConfig,
  type ReflectionInput,
  type ReflectionResult,
  type ValidationRule,
  type SourceDocument,
  VALIDATION_RULES,
} from './self-reflection';

import {
  HallucinationDetector,
  type HallucinationDetectionConfig,
  type HallucinationReport,
  PREVENTION_STRATEGIES,
} from './hallucination-detection';

import {
  ConfidenceCalibrator,
  type CalibrationConfig,
  type ConfidenceScore,
  type UncertaintyDecomposition,
} from './confidence-calibration';

import {
  FastReflectionEngine,
  createFastReflection,
  createUltraFastGenerator,
  fastGenerate,
  LATENCY_PRESETS,
  type FastReflectionConfig,
  type FastReflectionResult,
  type StreamingReflectionResult,
} from './fast-reflection';

// ============================================================================
// Types
// ============================================================================

export interface ReflectiveAIConfig {
  /** Tenant ID for multi-tenant setup */
  tenantId: string;
  /** Enable self-reflection loop */
  enableReflection: boolean;
  /** Enable hallucination detection */
  enableHallucinationDetection: boolean;
  /** Enable confidence calibration */
  enableConfidenceCalibration: boolean;
  /** Maximum reflection iterations */
  maxReflectionIterations: number;
  /** Confidence threshold to accept response */
  confidenceThreshold: number;
  /** Hallucination sensitivity */
  hallucinationSensitivity: 'low' | 'medium' | 'high';
  /** Custom validation rules */
  validationRules?: ValidationRule[];
  /** Model override for reflection (can use cheaper model) */
  reflectionModel?: string;
}

export interface GenerationInput {
  /** User query */
  query: string;
  /** Source documents for RAG */
  context?: string[] | SourceDocument[];
  /** Conversation history */
  conversationHistory?: CoreMessage[];
  /** System prompt override */
  systemPrompt?: string;
  /** Generation temperature */
  temperature?: number;
  /** Maximum tokens */
  maxTokens?: number;
  /** Skip reflection for this request */
  skipReflection?: boolean;
}

export interface ReflectiveGenerationResult {
  /** Final response after reflection */
  response: string;
  /** Original response before reflection */
  originalResponse: string;
  /** Whether the response was refined */
  wasRefined: boolean;
  /** Confidence score */
  confidence: ConfidenceScore;
  /** Hallucination report */
  hallucinationReport?: HallucinationReport;
  /** Reflection details */
  reflection?: ReflectionResult;
  /** Uncertainty decomposition */
  uncertainty?: UncertaintyDecomposition;
  /** Processing metadata */
  metadata: {
    totalTimeMs: number;
    generationTimeMs: number;
    reflectionTimeMs: number;
    iterations: number;
  };
}

export interface ThinkingTrace {
  step: string;
  thought: string;
  action: string;
  result: string;
  confidence: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ReflectiveAIConfig = {
  tenantId: 'default',
  enableReflection: true,
  enableHallucinationDetection: true,
  enableConfidenceCalibration: true,
  maxReflectionIterations: 3,
  confidenceThreshold: 0.85,
  hallucinationSensitivity: 'medium',
};

// ============================================================================
// Reflective AI Class
// ============================================================================

export class ReflectiveAI {
  private config: ReflectiveAIConfig;
  private reflectionEngine: SelfReflectionEngine;
  private hallucinationDetector: HallucinationDetector;
  private confidenceCalibrator: ConfidenceCalibrator;
  
  constructor(config: Partial<ReflectiveAIConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.reflectionEngine = new SelfReflectionEngine({
      tenantId: this.config.tenantId,
      maxIterations: this.config.maxReflectionIterations,
      confidenceThreshold: this.config.confidenceThreshold,
      enableFactualGrounding: true,
      enableSelfConsistency: true,
      enableChainOfThought: true,
    });
    
    this.hallucinationDetector = new HallucinationDetector({
      tenantId: this.config.tenantId,
      sensitivity: this.config.hallucinationSensitivity,
      enableNLI: true,
      enableClaimExtraction: true,
      enableEntityVerification: true,
    });
    
    this.confidenceCalibrator = new ConfidenceCalibrator({
      tenantId: this.config.tenantId,
      enableTemperatureScaling: true,
      enableEnsemble: true,
      ensembleSize: 3,
    });
  }
  
  /**
   * Generate a response with full reflection pipeline
   */
  async generateWithReflection(
    input: GenerationInput
  ): Promise<ReflectiveGenerationResult> {
    const startTime = Date.now();
    
    // Step 1: Generate initial response
    const generationStart = Date.now();
    const initialResponse = await this.generateInitialResponse(input);
    const generationTimeMs = Date.now() - generationStart;
    
    // If reflection is disabled or skipped, return early
    if (!this.config.enableReflection || input.skipReflection) {
      const confidence = await this.confidenceCalibrator.estimateConfidence(
        input.query,
        initialResponse,
        this.normalizeContext(input.context)
      );
      
      return {
        response: initialResponse,
        originalResponse: initialResponse,
        wasRefined: false,
        confidence,
        metadata: {
          totalTimeMs: Date.now() - startTime,
          generationTimeMs,
          reflectionTimeMs: 0,
          iterations: 0,
        },
      };
    }
    
    // Step 2: Self-reflection loop
    const reflectionStart = Date.now();
    const sourceDocuments = this.normalizeSourceDocuments(input.context);
    
    const reflectionResult = await this.reflectionEngine.reflect({
      query: input.query,
      initialResponse,
      sourceDocuments,
      conversationHistory: input.conversationHistory,
      validationRules: [
        ...Object.values(VALIDATION_RULES),
        ...(this.config.validationRules || []),
      ],
    });
    
    // Step 3: Hallucination detection
    let hallucinationReport: HallucinationReport | undefined;
    if (this.config.enableHallucinationDetection) {
      hallucinationReport = await this.hallucinationDetector.detect(
        reflectionResult.finalResponse,
        sourceDocuments.map(d => d.content),
        input.query
      );
      
      // If hallucinations detected, use corrected response
      if (hallucinationReport.detected && hallucinationReport.correctedResponse) {
        reflectionResult.finalResponse = hallucinationReport.correctedResponse;
      }
    }
    
    // Step 4: Confidence calibration
    const confidence = await this.confidenceCalibrator.estimateConfidence(
      input.query,
      reflectionResult.finalResponse,
      this.normalizeContext(input.context)
    );
    
    // Step 5: Uncertainty decomposition
    let uncertainty: UncertaintyDecomposition | undefined;
    if (confidence.overall < this.config.confidenceThreshold) {
      uncertainty = await this.confidenceCalibrator.decomposeUncertainty(
        input.query,
        reflectionResult.finalResponse,
        this.normalizeContext(input.context)
      );
    }
    
    const reflectionTimeMs = Date.now() - reflectionStart;
    
    return {
      response: reflectionResult.finalResponse,
      originalResponse: initialResponse,
      wasRefined: reflectionResult.wasRefined,
      confidence,
      hallucinationReport,
      reflection: reflectionResult,
      uncertainty,
      metadata: {
        totalTimeMs: Date.now() - startTime,
        generationTimeMs,
        reflectionTimeMs,
        iterations: reflectionResult.iterations,
      },
    };
  }
  
  /**
   * Generate initial response using LLM
   */
  private async generateInitialResponse(input: GenerationInput): Promise<string> {
    const llm = getLLM(this.config.tenantId);
    const context = this.normalizeContext(input.context);
    
    // Use hallucination prevention prompt strategy
    const systemPrompt = input.systemPrompt || this.buildSystemPrompt(context);
    
    const messages: CoreMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(input.conversationHistory || []),
      { role: 'user', content: input.query },
    ];
    
    const result = await generateText({
      model: llm,
      messages,
      temperature: input.temperature ?? 0.3,
      maxOutputTokens: input.maxTokens,
    });
    
    return result.text;
  }
  
  /**
   * Build a hallucination-resistant system prompt
   */
  private buildSystemPrompt(context?: string | string[]): string {
    const basePrompt = `You are a helpful AI assistant. Your responses should be:
- Accurate and factual
- Based only on provided context when available
- Clear about uncertainty when it exists
- Well-structured and helpful`;
    
    if (!context || (Array.isArray(context) && context.length === 0)) {
      return `${basePrompt}

IMPORTANT: If you don't have reliable information to answer a question, acknowledge this limitation rather than speculating.`;
    }
    
    const contextStr = Array.isArray(context) ? context.join('\n\n---\n\n') : context;
    
    return `${basePrompt}

You have been provided with source documents to help answer the user's question.

SOURCE DOCUMENTS:
${contextStr}

CRITICAL INSTRUCTIONS:
1. Base your answer primarily on the provided source documents
2. If a claim isn't supported by the sources, either omit it or clearly state it's your inference
3. Use phrases like "According to the document..." or "Based on the provided information..."
4. If the sources don't contain enough information, say so explicitly
5. Never fabricate facts, quotes, or statistics not in the sources`;
  }
  
  /**
   * Normalize context to string or string array
   */
  private normalizeContext(
    context?: string[] | SourceDocument[]
  ): string | string[] | undefined {
    if (!context) return undefined;
    if (context.length === 0) return undefined;
    
    if (typeof context[0] === 'string') {
      return context as string[];
    }
    
    return (context as SourceDocument[]).map(doc => doc.content);
  }
  
  /**
   * Normalize to SourceDocument array
   */
  private normalizeSourceDocuments(
    context?: string[] | SourceDocument[]
  ): SourceDocument[] {
    if (!context) return [];
    if (context.length === 0) return [];
    
    if (typeof context[0] === 'string') {
      return (context as string[]).map((content, i) => ({
        id: `doc-${i}`,
        content,
      }));
    }
    
    return context as SourceDocument[];
  }
  
  /**
   * Chain-of-Thought generation with visible thinking
   */
  async generateWithThinking(
    input: GenerationInput
  ): Promise<ReflectiveGenerationResult & { thinking: ThinkingTrace[] }> {
    const llm = getLLM(this.config.tenantId);
    const context = this.normalizeContext(input.context);
    const thinking: ThinkingTrace[] = [];
    
    // Step 1: Understand the query
    thinking.push({
      step: 'understand',
      thought: 'First, I need to understand what the user is asking...',
      action: 'Analyzing the query',
      result: input.query,
      confidence: 1,
    });
    
    // Step 2: Gather relevant information
    const gatherPrompt = `Given this query: "${input.query}"

${context ? `And these source documents:\n${Array.isArray(context) ? context.join('\n') : context}` : 'No source documents provided.'}

What are the key pieces of information needed to answer this query? List them.`;

    const gatherResult = await generateText({
      model: llm,
      messages: [{ role: 'user', content: gatherPrompt }],
      temperature: 0,
    });
    
    thinking.push({
      step: 'gather',
      thought: 'What information do I need to answer this?',
      action: 'Identifying key information',
      result: gatherResult.text,
      confidence: 0.9,
    });
    
    // Step 3: Reason through the answer
    const reasonPrompt = `Query: "${input.query}"
Key information: ${gatherResult.text}

Think through this step by step:
1. What do we know for certain?
2. What can we infer?
3. What are we uncertain about?
4. What's the logical conclusion?`;

    const reasonResult = await generateText({
      model: llm,
      messages: [{ role: 'user', content: reasonPrompt }],
      temperature: 0.1,
    });
    
    thinking.push({
      step: 'reason',
      thought: 'Let me think through this logically...',
      action: 'Reasoning through the answer',
      result: reasonResult.text,
      confidence: 0.85,
    });
    
    // Step 4: Generate answer
    const answerPrompt = `Based on this reasoning:
${reasonResult.text}

Provide a clear, accurate answer to: "${input.query}"

Be direct but acknowledge any uncertainties.`;

    const answerResult = await generateText({
      model: llm,
      messages: [{ role: 'user', content: answerPrompt }],
      temperature: 0.2,
    });
    
    thinking.push({
      step: 'answer',
      thought: 'Now I can formulate my response...',
      action: 'Generating answer',
      result: answerResult.text,
      confidence: 0.8,
    });
    
    // Step 5: Self-verify
    const verifyPrompt = `Verify this answer:
"${answerResult.text}"

Against this reasoning:
${reasonResult.text}

Is the answer accurate and complete? Any issues?`;

    const verifyResult = await generateText({
      model: llm,
      messages: [{ role: 'user', content: verifyPrompt }],
      temperature: 0,
    });
    
    thinking.push({
      step: 'verify',
      thought: 'Let me double-check my answer...',
      action: 'Self-verification',
      result: verifyResult.text,
      confidence: 0.9,
    });
    
    // Run full reflection on the answer
    const result = await this.generateWithReflection({
      ...input,
      skipReflection: false,
    });
    
    return {
      ...result,
      thinking,
    };
  }
  
  /**
   * Record feedback for calibration
   */
  recordFeedback(
    query: string,
    predictedConfidence: number,
    wasCorrect: boolean
  ): void {
    this.confidenceCalibrator.recordFeedback(query, predictedConfidence, wasCorrect);
  }
  
  /**
   * Get calibration metrics
   */
  getCalibrationMetrics() {
    return this.confidenceCalibrator.getCalibrationMetrics();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a ReflectiveAI instance
 */
export function createReflectiveAI(
  tenantId: string,
  options: Partial<ReflectiveAIConfig> = {}
): ReflectiveAI {
  return new ReflectiveAI({
    tenantId,
    ...options,
  });
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  SelfReflectionEngine,
  HallucinationDetector,
  ConfidenceCalibrator,
  FastReflectionEngine,
  VALIDATION_RULES,
  PREVENTION_STRATEGIES,
  LATENCY_PRESETS,
  createFastReflection,
  createUltraFastGenerator,
  fastGenerate,
};

export type {
  ReflectionConfig,
  ReflectionInput,
  ReflectionResult,
  ValidationRule,
  SourceDocument,
  HallucinationDetectionConfig,
  HallucinationReport,
  CalibrationConfig,
  ConfidenceScore,
  UncertaintyDecomposition,
  FastReflectionConfig,
  FastReflectionResult,
  StreamingReflectionResult,
};

export default ReflectiveAI;

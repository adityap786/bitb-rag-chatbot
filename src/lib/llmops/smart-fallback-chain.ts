/**
 * Smart Fallback Chain - LLMOps Feature #2
 * 
 * NEVER leave customers with "I don't know" - always provide value.
 * This is what makes users feel the AI is truly intelligent.
 * 
 * Fallback Strategy:
 * 1. Primary RAG answer (high confidence)
 * 2. Relaxed RAG search (lower similarity threshold)
 * 3. LLM general knowledge with disclaimers
 * 4. Guided escalation with context preservation
 * 5. Smart suggestions based on query intent
 * 
 * @module llmops/smart-fallback-chain
 */

import { logger } from '../observability/logger';
import { qualityAnalyzer, QualityMetrics } from './response-quality-analyzer';

// ============================================================================
// Types
// ============================================================================

export type FallbackLevel = 
  | 'primary_rag'
  | 'relaxed_rag'
  | 'llm_general'
  | 'guided_escalation'
  | 'smart_suggestions';

export interface FallbackConfig {
  // Confidence thresholds for each level
  primary_threshold: number;      // Default: 0.75
  relaxed_threshold: number;      // Default: 0.50
  llm_threshold: number;          // Default: 0.30
  
  // Enable/disable levels
  enable_relaxed_rag: boolean;
  enable_llm_general: boolean;
  enable_guided_escalation: boolean;
  enable_smart_suggestions: boolean;
  
  // Customization
  max_fallback_attempts: number;
  timeout_per_level_ms: number;
  
  // Branding
  escalation_message: string;
  no_answer_message: string;
}

export interface FallbackResult {
  answer: string;
  confidence: number;
  fallback_level: FallbackLevel;
  levels_attempted: FallbackLevel[];
  sources: any[];
  quality_metrics?: QualityMetrics;
  
  // User-facing
  disclaimer?: string;
  suggestions?: string[];
  escalation_offered: boolean;
  
  // Analytics
  total_latency_ms: number;
  fallback_reason: string;
}

export interface FallbackContext {
  query: string;
  tenantId: string;
  sessionId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  userIntent?: string;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: FallbackConfig = {
  primary_threshold: 0.75,
  relaxed_threshold: 0.50,
  llm_threshold: 0.30,
  enable_relaxed_rag: true,
  enable_llm_general: true,
  enable_guided_escalation: true,
  enable_smart_suggestions: true,
  max_fallback_attempts: 4,
  timeout_per_level_ms: 5000,
  escalation_message: "I'd be happy to connect you with a human expert who can help with this specific question.",
  no_answer_message: "I want to make sure I give you accurate information. Let me suggest some alternatives.",
};

// ============================================================================
// Smart Fallback Chain
// ============================================================================

export class SmartFallbackChain {
  private config: FallbackConfig;
  
  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute the fallback chain until we get a satisfactory answer
   */
  async execute(
    context: FallbackContext,
    primaryRagFn: (query: string, threshold: number) => Promise<{ answer: string; confidence: number; sources: any[] }>,
    llmGeneralFn?: (query: string, context: string) => Promise<{ answer: string; confidence: number }>
  ): Promise<FallbackResult> {
    const startTime = Date.now();
    const levelsAttempted: FallbackLevel[] = [];
    
    // Level 1: Primary RAG
    levelsAttempted.push('primary_rag');
    const primaryResult = await this.tryWithTimeout(
      () => primaryRagFn(context.query, this.config.primary_threshold),
      this.config.timeout_per_level_ms
    );
    
    if (primaryResult && primaryResult.confidence >= this.config.primary_threshold) {
      return this.buildResult({
        answer: primaryResult.answer,
        confidence: primaryResult.confidence,
        fallbackLevel: 'primary_rag',
        levelsAttempted,
        sources: primaryResult.sources,
        startTime,
        reason: 'High confidence answer from knowledge base',
        context,
      });
    }
    
    // Level 2: Relaxed RAG (lower similarity threshold)
    if (this.config.enable_relaxed_rag) {
      levelsAttempted.push('relaxed_rag');
      const relaxedResult = await this.tryWithTimeout(
        () => primaryRagFn(context.query, this.config.relaxed_threshold),
        this.config.timeout_per_level_ms
      );
      
      if (relaxedResult && relaxedResult.confidence >= this.config.relaxed_threshold) {
        return this.buildResult({
          answer: this.enhanceWithDisclaimer(relaxedResult.answer, 'relaxed_rag'),
          confidence: relaxedResult.confidence,
          fallbackLevel: 'relaxed_rag',
          levelsAttempted,
          sources: relaxedResult.sources,
          startTime,
          reason: 'Found related information with lower confidence',
          context,
          disclaimer: 'This answer is based on related information in our knowledge base.',
        });
      }
    }
    
    // Level 3: LLM General Knowledge
    if (this.config.enable_llm_general && llmGeneralFn) {
      levelsAttempted.push('llm_general');
      
      const contextString = this.buildLLMContext(context);
      const llmResult = await this.tryWithTimeout(
        () => llmGeneralFn(context.query, contextString),
        this.config.timeout_per_level_ms
      );
      
      if (llmResult && llmResult.confidence >= this.config.llm_threshold) {
        return this.buildResult({
          answer: this.enhanceWithDisclaimer(llmResult.answer, 'llm_general'),
          confidence: llmResult.confidence,
          fallbackLevel: 'llm_general',
          levelsAttempted,
          sources: [],
          startTime,
          reason: 'Using general AI knowledge (not from your specific documents)',
          context,
          disclaimer: 'This response uses general AI knowledge and may not reflect your specific business information.',
        });
      }
    }
    
    // Level 4: Guided Escalation
    if (this.config.enable_guided_escalation) {
      levelsAttempted.push('guided_escalation');
      
      const escalationResponse = this.buildGuidedEscalation(context);
      return this.buildResult({
        answer: escalationResponse.message,
        confidence: 0.5,
        fallbackLevel: 'guided_escalation',
        levelsAttempted,
        sources: [],
        startTime,
        reason: 'Query requires human expertise',
        context,
        suggestions: escalationResponse.suggestions,
        escalationOffered: true,
      });
    }
    
    // Level 5: Smart Suggestions (last resort)
    levelsAttempted.push('smart_suggestions');
    const suggestions = this.generateSmartSuggestions(context);
    
    return this.buildResult({
      answer: this.config.no_answer_message,
      confidence: 0.2,
      fallbackLevel: 'smart_suggestions',
      levelsAttempted,
      sources: [],
      startTime,
      reason: 'Could not find a direct answer',
      context,
      suggestions,
    });
  }

  /**
   * Build guided escalation with context
   */
  private buildGuidedEscalation(context: FallbackContext): {
    message: string;
    suggestions: string[];
  } {
    const intent = this.detectIntent(context.query);
    
    let message = this.config.escalation_message;
    const suggestions: string[] = [];
    
    // Add intent-specific guidance
    switch (intent) {
      case 'pricing':
        message = "I'd love to help with pricing details! Let me connect you with our sales team who can provide personalized quotes.";
        suggestions.push('Request a callback', 'Schedule a demo', 'View pricing page');
        break;
      case 'support':
        message = "This sounds like it needs technical support. Let me get you connected with someone who can help right away.";
        suggestions.push('Open support ticket', 'Chat with agent', 'Check status of existing ticket');
        break;
      case 'booking':
        message = "I can help you book an appointment! Let me show you available times.";
        suggestions.push('View calendar', 'Book consultation', 'Reschedule existing appointment');
        break;
      case 'complaint':
        message = "I'm sorry you're experiencing issues. Let me connect you with our customer success team immediately.";
        suggestions.push('Speak to manager', 'File formal complaint', 'Request refund');
        break;
      default:
        suggestions.push('Talk to a human', 'Browse help articles', 'Ask a different question');
    }
    
    return { message, suggestions };
  }

  /**
   * Generate smart suggestions based on query
   */
  private generateSmartSuggestions(context: FallbackContext): string[] {
    const intent = this.detectIntent(context.query);
    const suggestions: string[] = [];
    
    // Intent-based suggestions
    const intentSuggestions: Record<string, string[]> = {
      pricing: ['What plans do you offer?', 'Do you have a free trial?', 'What features are included?'],
      support: ['How do I reset my password?', 'Where can I find documentation?', 'What are your support hours?'],
      product: ['What products do you sell?', 'Show me bestsellers', 'Do you have any deals?'],
      booking: ['What times are available?', 'How do I reschedule?', 'What is your cancellation policy?'],
      general: ['Tell me about your services', 'How can I contact you?', 'What makes you different?'],
    };
    
    suggestions.push(...(intentSuggestions[intent] || intentSuggestions.general));
    
    // Add query-specific rephrasing
    const simpler = this.simplifyQuery(context.query);
    if (simpler !== context.query) {
      suggestions.unshift(simpler);
    }
    
    return suggestions.slice(0, 4);
  }

  /**
   * Detect user intent from query
   */
  private detectIntent(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    const intentPatterns: Record<string, string[]> = {
      pricing: ['price', 'cost', 'how much', 'pricing', 'plan', 'subscription', 'payment', 'discount'],
      support: ['help', 'issue', 'problem', 'error', 'not working', 'bug', 'fix', 'support'],
      booking: ['book', 'schedule', 'appointment', 'meeting', 'calendar', 'available', 'reserve'],
      product: ['product', 'item', 'buy', 'purchase', 'shop', 'order', 'shipping'],
      complaint: ['refund', 'complaint', 'angry', 'disappointed', 'terrible', 'worst', 'unacceptable'],
    };
    
    for (const [intent, patterns] of Object.entries(intentPatterns)) {
      if (patterns.some(p => lowerQuery.includes(p))) {
        return intent;
      }
    }
    
    return 'general';
  }

  /**
   * Simplify query for suggestion
   */
  private simplifyQuery(query: string): string {
    // Remove filler words and simplify
    const simplified = query
      .replace(/\b(please|could you|can you|i want to|i need to|help me)\b/gi, '')
      .replace(/\?+$/, '')
      .trim();
    
    if (simplified.length < query.length * 0.7) {
      return simplified + '?';
    }
    return query;
  }

  /**
   * Add appropriate disclaimer to response
   */
  private enhanceWithDisclaimer(answer: string, level: FallbackLevel): string {
    // Don't modify, just return - disclaimer is added separately
    return answer;
  }

  /**
   * Build context string for LLM
   */
  private buildLLMContext(context: FallbackContext): string {
    const parts: string[] = [];
    
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      parts.push('Previous conversation:');
      for (const msg of context.conversationHistory.slice(-3)) {
        parts.push(`${msg.role}: ${msg.content}`);
      }
    }
    
    if (context.userIntent) {
      parts.push(`Detected intent: ${context.userIntent}`);
    }
    
    return parts.join('\n');
  }

  /**
   * Execute with timeout
   */
  private async tryWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T | null> {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      return result;
    } catch (error) {
      logger.warn('Fallback level failed', { error: String(error) });
      return null;
    }
  }

  /**
   * Build final result
   */
  private async buildResult(params: {
    answer: string;
    confidence: number;
    fallbackLevel: FallbackLevel;
    levelsAttempted: FallbackLevel[];
    sources: any[];
    startTime: number;
    reason: string;
    context: FallbackContext;
    disclaimer?: string;
    suggestions?: string[];
    escalationOffered?: boolean;
  }): Promise<FallbackResult> {
    const totalLatency = Date.now() - params.startTime;
    
    // Analyze quality if we have an answer
    let qualityMetrics: QualityMetrics | undefined;
    if (params.answer && params.sources.length > 0) {
      try {
        qualityMetrics = await qualityAnalyzer.analyzeResponse({
          query: params.context.query,
          response: params.answer,
          sources: params.sources.map(s => ({
            content: s.content || s.chunk || '',
            similarity: s.similarity || s.score || 0,
            title: s.title,
          })),
          responseTimeMs: totalLatency,
          tenantId: params.context.tenantId,
          sessionId: params.context.sessionId,
        });
      } catch (e) {
        // Quality analysis is optional
      }
    }
    
    return {
      answer: params.answer,
      confidence: params.confidence,
      fallback_level: params.fallbackLevel,
      levels_attempted: params.levelsAttempted,
      sources: params.sources,
      quality_metrics: qualityMetrics,
      disclaimer: params.disclaimer,
      suggestions: params.suggestions,
      escalation_offered: params.escalationOffered || false,
      total_latency_ms: totalLatency,
      fallback_reason: params.reason,
    };
  }
}

/**
 * Create a configured fallback chain
 */
export function createFallbackChain(config?: Partial<FallbackConfig>): SmartFallbackChain {
  return new SmartFallbackChain(config);
}

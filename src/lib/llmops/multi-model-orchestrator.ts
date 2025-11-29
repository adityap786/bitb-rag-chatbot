/**
 * Multi-Model Orchestrator - LLMOps Feature #9
 * 
 * "Best model for each question, automatically"
 * 
 * Intelligently routes queries to the optimal model based on:
 * - Query complexity
 * - Cost constraints
 * - Latency requirements
 * - Quality requirements
 * - Model availability (fallback chain)
 * 
 * @module llmops/multi-model-orchestrator
 */

import { costPredictor, ModelPricing } from './cost-predictor';
import { logger } from '../observability/logger';

// ============================================================================
// Types
// ============================================================================

export type QueryComplexity = 'simple' | 'moderate' | 'complex' | 'expert';
export type ModelTier = 'economy' | 'standard' | 'premium' | 'expert';

export interface ModelConfig {
  id: string;
  name: string;
  provider: 'openai' | 'groq' | 'anthropic' | 'cohere' | 'local';
  tier: ModelTier;
  
  // Capabilities
  max_tokens: number;
  supports_function_calling: boolean;
  supports_vision: boolean;
  supports_streaming: boolean;
  
  // Performance
  avg_latency_ms: number;
  tokens_per_second: number;
  
  // Cost (per 1K tokens)
  input_cost: number;
  output_cost: number;
  
  // Quality
  quality_score: number; // 0-100
  best_for: string[];
  
  // Availability
  is_available: boolean;
  rate_limit_remaining?: number;
}

export interface RoutingDecision {
  selected_model: ModelConfig;
  reason: string;
  alternatives: ModelConfig[];
  estimated_cost: number;
  estimated_latency_ms: number;
  complexity_detected: QueryComplexity;
}

export interface RoutingRules {
  // Query-based routing
  complexity_thresholds: {
    simple_max_tokens: number;
    moderate_max_tokens: number;
    complex_max_tokens: number;
  };
  
  // Cost constraints
  max_cost_per_query: number;
  prefer_economy: boolean;
  
  // Quality constraints
  min_quality_score: number;
  
  // Latency constraints
  max_latency_ms: number;
  
  // Feature requirements
  require_function_calling: boolean;
  require_streaming: boolean;
}

// ============================================================================
// Model Registry
// ============================================================================

const MODEL_REGISTRY: ModelConfig[] = [
  // Economy tier - fast and cheap
  {
    id: 'groq-llama-8b',
    name: 'Llama 3.1 8B (Groq)',
    provider: 'groq',
    tier: 'economy',
    max_tokens: 8192,
    supports_function_calling: false,
    supports_vision: false,
    supports_streaming: true,
    avg_latency_ms: 200,
    tokens_per_second: 500,
    input_cost: 0.00005,
    output_cost: 0.00008,
    quality_score: 70,
    best_for: ['simple_qa', 'classification', 'extraction'],
    is_available: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 'economy',
    max_tokens: 128000,
    supports_function_calling: true,
    supports_vision: true,
    supports_streaming: true,
    avg_latency_ms: 800,
    tokens_per_second: 100,
    input_cost: 0.00015,
    output_cost: 0.0006,
    quality_score: 82,
    best_for: ['general_qa', 'summarization', 'simple_reasoning'],
    is_available: true,
  },
  
  // Standard tier - balanced
  {
    id: 'groq-llama-70b',
    name: 'Llama 3.1 70B (Groq)',
    provider: 'groq',
    tier: 'standard',
    max_tokens: 8192,
    supports_function_calling: true,
    supports_vision: false,
    supports_streaming: true,
    avg_latency_ms: 400,
    tokens_per_second: 200,
    input_cost: 0.00059,
    output_cost: 0.00079,
    quality_score: 85,
    best_for: ['complex_qa', 'reasoning', 'analysis'],
    is_available: true,
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    tier: 'standard',
    max_tokens: 200000,
    supports_function_calling: true,
    supports_vision: true,
    supports_streaming: true,
    avg_latency_ms: 500,
    tokens_per_second: 150,
    input_cost: 0.00025,
    output_cost: 0.00125,
    quality_score: 84,
    best_for: ['safety_critical', 'long_context', 'analysis'],
    is_available: true,
  },
  
  // Premium tier - high quality
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    tier: 'premium',
    max_tokens: 128000,
    supports_function_calling: true,
    supports_vision: true,
    supports_streaming: true,
    avg_latency_ms: 1500,
    tokens_per_second: 80,
    input_cost: 0.005,
    output_cost: 0.015,
    quality_score: 92,
    best_for: ['complex_reasoning', 'code_generation', 'creative'],
    is_available: true,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    tier: 'premium',
    max_tokens: 200000,
    supports_function_calling: true,
    supports_vision: true,
    supports_streaming: true,
    avg_latency_ms: 1200,
    tokens_per_second: 100,
    input_cost: 0.003,
    output_cost: 0.015,
    quality_score: 93,
    best_for: ['coding', 'analysis', 'long_documents'],
    is_available: true,
  },
  
  // Expert tier - best quality
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    tier: 'expert',
    max_tokens: 128000,
    supports_function_calling: true,
    supports_vision: true,
    supports_streaming: true,
    avg_latency_ms: 2000,
    tokens_per_second: 60,
    input_cost: 0.01,
    output_cost: 0.03,
    quality_score: 95,
    best_for: ['expert_reasoning', 'research', 'complex_analysis'],
    is_available: true,
  },
];

// ============================================================================
// Multi-Model Orchestrator
// ============================================================================

export class MultiModelOrchestrator {
  private static instance: MultiModelOrchestrator;
  private modelAvailability = new Map<string, { available: boolean; lastCheck: number }>();
  
  static getInstance(): MultiModelOrchestrator {
    if (!MultiModelOrchestrator.instance) {
      MultiModelOrchestrator.instance = new MultiModelOrchestrator();
    }
    return MultiModelOrchestrator.instance;
  }

  /**
   * Route query to optimal model
   */
  async routeQuery(params: {
    query: string;
    tenantId: string;
    rules?: Partial<RoutingRules>;
    context?: {
      conversationLength?: number;
      hasCodeBlocks?: boolean;
      requiresReasoning?: boolean;
      isUrgent?: boolean;
    };
  }): Promise<RoutingDecision> {
    const rules = this.getDefaultRules(params.rules);
    const complexity = this.detectComplexity(params.query, params.context);
    
    // Get available models
    const availableModels = MODEL_REGISTRY.filter(m => this.isModelAvailable(m.id));
    
    // Filter by constraints
    let candidates = this.filterByConstraints(availableModels, rules, complexity);
    
    // Score and rank models
    const scored = this.scoreModels(candidates, complexity, rules, params.context);
    
    // Select best model
    const selected = scored[0];
    
    if (!selected) {
      throw new Error('No suitable model available');
    }
    
    // Estimate cost
    const estimatedTokens = this.estimateTokens(params.query);
    const estimatedCost = costPredictor.calculateCost({
      model: selected.model.id,
      inputTokens: estimatedTokens.input,
      outputTokens: estimatedTokens.output,
    });
    
    const decision: RoutingDecision = {
      selected_model: selected.model,
      reason: this.generateReason(selected, complexity, rules),
      alternatives: scored.slice(1, 4).map(s => s.model),
      estimated_cost: estimatedCost,
      estimated_latency_ms: selected.model.avg_latency_ms,
      complexity_detected: complexity,
    };
    
    logger.info('Model routed', {
      tenantId: params.tenantId,
      selectedModel: selected.model.id,
      complexity,
      estimatedCost,
    });
    
    return decision;
  }

  /**
   * Detect query complexity
   */
  private detectComplexity(
    query: string,
    context?: { conversationLength?: number; hasCodeBlocks?: boolean; requiresReasoning?: boolean }
  ): QueryComplexity {
    const wordCount = query.split(/\s+/).length;
    
    // Expert indicators
    const expertPatterns = [
      /analyze.*in depth/i,
      /compare and contrast/i,
      /explain.*step by step/i,
      /write.*code/i,
      /debug.*error/i,
      /complex.*logic/i,
      /mathematical.*proof/i,
      /research.*topic/i,
    ];
    
    // Complex indicators
    const complexPatterns = [
      /why.*and.*how/i,
      /explain.*reasoning/i,
      /multiple.*factors/i,
      /evaluate/i,
      /synthesize/i,
      /what are the implications/i,
    ];
    
    // Moderate indicators
    const moderatePatterns = [
      /how do i/i,
      /what is the best/i,
      /can you help/i,
      /describe/i,
      /summarize/i,
    ];
    
    // Check patterns
    if (expertPatterns.some(p => p.test(query)) || context?.hasCodeBlocks) {
      return 'expert';
    }
    
    if (complexPatterns.some(p => p.test(query)) || context?.requiresReasoning) {
      return 'complex';
    }
    
    if (moderatePatterns.some(p => p.test(query)) || wordCount > 30) {
      return 'moderate';
    }
    
    // Check for question complexity
    const questionMarks = (query.match(/\?/g) || []).length;
    if (questionMarks > 2) return 'complex';
    if (questionMarks > 1) return 'moderate';
    
    return 'simple';
  }

  /**
   * Get default routing rules
   */
  private getDefaultRules(overrides?: Partial<RoutingRules>): RoutingRules {
    return {
      complexity_thresholds: {
        simple_max_tokens: 500,
        moderate_max_tokens: 1000,
        complex_max_tokens: 2000,
      },
      max_cost_per_query: 0.10,
      prefer_economy: true,
      min_quality_score: 70,
      max_latency_ms: 5000,
      require_function_calling: false,
      require_streaming: false,
      ...overrides,
    };
  }

  /**
   * Filter models by constraints
   */
  private filterByConstraints(
    models: ModelConfig[],
    rules: RoutingRules,
    complexity: QueryComplexity
  ): ModelConfig[] {
    return models.filter(m => {
      // Quality threshold
      if (m.quality_score < rules.min_quality_score) return false;
      
      // Latency threshold
      if (m.avg_latency_ms > rules.max_latency_ms) return false;
      
      // Feature requirements
      if (rules.require_function_calling && !m.supports_function_calling) return false;
      if (rules.require_streaming && !m.supports_streaming) return false;
      
      // Cost constraint (rough estimate)
      const avgCost = (m.input_cost * 0.5 + m.output_cost * 0.5) * 1; // Per 1K tokens
      if (avgCost > rules.max_cost_per_query) return false;
      
      // Complexity matching - don't use expert models for simple queries
      if (complexity === 'simple' && m.tier === 'expert') return false;
      
      // Don't use economy models for expert queries
      if (complexity === 'expert' && m.tier === 'economy') return false;
      
      return true;
    });
  }

  /**
   * Score models for selection
   */
  private scoreModels(
    models: ModelConfig[],
    complexity: QueryComplexity,
    rules: RoutingRules,
    context?: { isUrgent?: boolean }
  ): Array<{ model: ModelConfig; score: number }> {
    const complexityWeights: Record<QueryComplexity, { quality: number; cost: number; speed: number }> = {
      simple: { quality: 0.2, cost: 0.5, speed: 0.3 },
      moderate: { quality: 0.4, cost: 0.3, speed: 0.3 },
      complex: { quality: 0.5, cost: 0.2, speed: 0.3 },
      expert: { quality: 0.7, cost: 0.1, speed: 0.2 },
    };
    
    const weights = complexityWeights[complexity];
    
    // Adjust for urgency
    if (context?.isUrgent) {
      weights.speed = Math.min(0.5, weights.speed + 0.2);
      weights.cost -= 0.1;
    }
    
    const scored = models.map(m => {
      // Normalize scores to 0-1
      const qualityNorm = m.quality_score / 100;
      const costNorm = 1 - Math.min(1, (m.input_cost + m.output_cost) / 0.02); // Lower is better
      const speedNorm = 1 - Math.min(1, m.avg_latency_ms / 3000); // Lower is better
      
      const score = 
        qualityNorm * weights.quality +
        costNorm * weights.cost +
        speedNorm * weights.speed;
      
      // Bonus for matching tier
      const tierMatch = this.getTierForComplexity(complexity);
      const tierBonus = m.tier === tierMatch ? 0.1 : 0;
      
      return {
        model: m,
        score: score + tierBonus,
      };
    });
    
    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score);
  }

  private getTierForComplexity(complexity: QueryComplexity): ModelTier {
    switch (complexity) {
      case 'simple': return 'economy';
      case 'moderate': return 'standard';
      case 'complex': return 'premium';
      case 'expert': return 'expert';
    }
  }

  /**
   * Estimate tokens for query
   */
  private estimateTokens(query: string): { input: number; output: number } {
    // Rough estimate: 1 token ≈ 4 characters
    const inputTokens = Math.ceil(query.length / 4);
    
    // Estimate output based on query type
    let outputMultiplier = 3; // Default 3x input
    if (/summarize|brief/i.test(query)) outputMultiplier = 1;
    if (/explain|describe|detail/i.test(query)) outputMultiplier = 5;
    if (/write|generate|create/i.test(query)) outputMultiplier = 8;
    
    return {
      input: inputTokens,
      output: inputTokens * outputMultiplier,
    };
  }

  /**
   * Check if model is available
   */
  private isModelAvailable(modelId: string): boolean {
    const cached = this.modelAvailability.get(modelId);
    const now = Date.now();
    
    // Cache for 5 minutes
    if (cached && now - cached.lastCheck < 5 * 60 * 1000) {
      return cached.available;
    }
    
    // For now, assume all models are available
    // In production, this would ping health endpoints
    const available = true;
    this.modelAvailability.set(modelId, { available, lastCheck: now });
    
    return available;
  }

  /**
   * Generate human-readable routing reason
   */
  private generateReason(
    selected: { model: ModelConfig; score: number },
    complexity: QueryComplexity,
    rules: RoutingRules
  ): string {
    const reasons: string[] = [];
    
    // Complexity match
    reasons.push(`Query detected as ${complexity} complexity`);
    
    // Model selection reason
    if (selected.model.tier === 'economy') {
      reasons.push('Economy model selected for cost optimization');
    } else if (selected.model.tier === 'premium' || selected.model.tier === 'expert') {
      reasons.push(`${selected.model.tier} model selected for quality`);
    }
    
    // Provider reason
    if (selected.model.provider === 'groq') {
      reasons.push('Groq selected for fastest response');
    }
    
    return reasons.join('. ');
  }

  /**
   * Execute query with automatic fallback
   */
  async executeWithFallback<T>(
    params: {
      query: string;
      tenantId: string;
      executor: (modelId: string) => Promise<T>;
      maxRetries?: number;
    }
  ): Promise<{ result: T; modelUsed: string; attempts: number }> {
    const routing = await this.routeQuery({
      query: params.query,
      tenantId: params.tenantId,
    });
    
    const models = [routing.selected_model, ...routing.alternatives];
    const maxRetries = params.maxRetries || 3;
    
    for (let i = 0; i < Math.min(models.length, maxRetries); i++) {
      const model = models[i];
      
      try {
        const result = await params.executor(model.id);
        return {
          result,
          modelUsed: model.id,
          attempts: i + 1,
        };
      } catch (error) {
        logger.warn('Model execution failed, trying fallback', {
          model: model.id,
          attempt: i + 1,
          error: String(error),
        });
        
        // Mark as unavailable temporarily
        this.modelAvailability.set(model.id, {
          available: false,
          lastCheck: Date.now(),
        });
        
        if (i === models.length - 1 || i >= maxRetries - 1) {
          throw error;
        }
      }
    }
    
    throw new Error('All models failed');
  }

  /**
   * Get model recommendations for a tenant
   */
  async getModelRecommendations(tenantId: string): Promise<{
    current_usage: Array<{ model: string; percentage: number }>;
    recommended_changes: Array<{
      from: string;
      to: string;
      reason: string;
      estimated_savings: number;
    }>;
  }> {
    // Would analyze actual usage patterns
    return {
      current_usage: [
        { model: 'gpt-4o', percentage: 60 },
        { model: 'gpt-4o-mini', percentage: 30 },
        { model: 'groq-llama-70b', percentage: 10 },
      ],
      recommended_changes: [
        {
          from: 'gpt-4o',
          to: 'groq-llama-70b',
          reason: 'Similar quality, 90% cost reduction for standard queries',
          estimated_savings: 150,
        },
        {
          from: 'gpt-4o',
          to: 'gpt-4o-mini',
          reason: 'Sufficient for simple queries',
          estimated_savings: 80,
        },
      ],
    };
  }
}

// Export singleton
export const modelOrchestrator = MultiModelOrchestrator.getInstance();

/**
 * LLMOps Module - Unified Exports
 * 
 * Production-grade LLM operations toolkit that makes users 
 * feel they MUST have a subscription.
 * 
 * Features that drive subscriptions:
 * 1. Response Quality Dashboard - See AI improve over time
 * 2. Smart Fallback Chains - Never leave users hanging
 * 3. Conversation Intelligence - Discover customer insights
 * 4. Prompt A/B Testing - Prove what works
 * 5. Cache Analytics - Show dollar savings
 * 6. RAG Quality Scoring - Trust your answers
 * 7. LLM Cost Predictor - Budget control
 * 8. Conversation Flow Builder - Visual design
 * 9. Multi-Model Orchestration - Best model automatically
 * 10. Knowledge Gap Detection - Know what content to create
 * 
 * @module llmops
 */

// Core quality and analytics
export {
  ResponseQualityAnalyzer,
  qualityAnalyzer,
  type QualityMetrics,
  type QualityFactor,
  type ResponseAnalysisInput,
} from './response-quality-analyzer';

// Smart fallback system
export {
  SmartFallbackChain,
  createFallbackChain,
  type FallbackConfig,
  type FallbackResult,
  type FallbackLevel,
  type FallbackContext,
} from './smart-fallback-chain';

// Conversation intelligence
export {
  ConversationIntelligence,
  conversationIntelligence,
  type ConversationInsights,
  type SentimentLevel,
  type IntentCategory,
  type ConversationMessage,
} from './conversation-intelligence';

// A/B testing
export {
  PromptABTestingEngine,
  promptABTesting,
  type ABTest,
  type PromptVariant,
  type ABTestResults,
  type VariantResult,
} from './prompt-ab-testing';

// Cache analytics
export {
  CacheAnalytics,
  cacheAnalytics,
  type CacheStats,
  type CacheOptimization,
  type CacheEvent,
  type PopularQuery,
} from './cache-analytics';

// Cost management
export {
  LLMCostPredictor,
  costPredictor,
  type CostSummary,
  type CostForecast,
  type CostOptimization,
  type BudgetConfig,
  type UsageRecord,
} from './cost-predictor';

// Multi-model orchestration
export {
  MultiModelOrchestrator,
  modelOrchestrator,
  type ModelConfig,
  type RoutingDecision,
  type RoutingRules,
  type QueryComplexity,
  type ModelTier,
} from './multi-model-orchestrator';

// Knowledge gap detection
export {
  KnowledgeGapDetector,
  knowledgeGapDetector,
  type KnowledgeGap,
  type GapReport,
  type ContentSuggestion,
  type UnansweredQuery,
} from './knowledge-gap-detector';

// RAG quality scoring
export {
  RAGQualityScorer,
  ragQualityScorer,
  type SourceMetadata,
  type TrustScore,
  type TrustFactor,
  type RetrievalQuality,
  type ChunkQuality,
  type SourcePerformance,
  type RAGQualityDashboard,
} from './rag-quality-scorer';

// Conversation flow builder
export {
  ConversationFlowBuilder,
  conversationFlowBuilder,
  type ConversationFlow,
  type FlowTrigger,
  type FlowNode,
  type MessageNode,
  type QuestionNode,
  type ConditionNode,
  type ActionNode,
  type ApiNode,
  type LLMNode,
  type HandoffNode,
  type DelayNode,
  type FlowEdge,
  type FlowVariable,
  type FlowMetadata,
  type FlowExecutionContext,
  type FlowAnalytics,
} from './conversation-flow-builder';

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize all LLMOps modules with tenant configuration
 */
export async function initializeLLMOps(config: {
  tenantId: string;
  dailyBudget?: number;
  monthlyBudget?: number;
  alertEmails?: string[];
}): Promise<void> {
  const { costPredictor } = await import('./cost-predictor');
  
  await costPredictor.setBudget({
    tenant_id: config.tenantId,
    daily_limit: config.dailyBudget || 50,
    monthly_limit: config.monthlyBudget || 1000,
    alert_threshold: 0.8,
    auto_throttle: true,
    throttle_threshold: 0.95,
    email_alerts: config.alertEmails || [],
  });
}

/**
 * Get comprehensive LLMOps dashboard data
 */
export async function getLLMOpsDashboard(tenantId: string): Promise<{
  quality: {
    avg_score: number;
    trend: string;
    top_issues: string[];
  };
  costs: {
    today: number;
    month: number;
    forecast: number;
    savings: number;
  };
  cache: {
    hit_rate: number;
    savings: number;
  };
  gaps: {
    count: number;
    top_topics: string[];
  };
  intelligence: {
    sentiment_avg: number;
    top_intents: string[];
  };
}> {
  const [
    { qualityAnalyzer },
    { costPredictor },
    { cacheAnalytics },
    { knowledgeGapDetector },
    { conversationIntelligence },
  ] = await Promise.all([
    import('./response-quality-analyzer'),
    import('./cost-predictor'),
    import('./cache-analytics'),
    import('./knowledge-gap-detector'),
    import('./conversation-intelligence'),
  ]);
  
  const [qualityData, costSummary, cacheStats, gapReport, aggregateAnalytics] = await Promise.all([
    qualityAnalyzer.getDashboardData(tenantId),
    costPredictor.getCostSummary(tenantId, 'this_month'),
    cacheAnalytics.getStats(tenantId, 'last_30d'),
    knowledgeGapDetector.generateGapReport(tenantId),
    conversationIntelligence.getAggregateAnalytics(tenantId),
  ]);
  
  const forecast = await costPredictor.getForecast(tenantId);
  
  return {
    quality: {
      avg_score: qualityData.current_avg_score,
      trend: qualityData.trend,
      top_issues: qualityData.top_issues.slice(0, 3),
    },
    costs: {
      today: (await costPredictor.getCostSummary(tenantId, 'today')).total_cost,
      month: costSummary.total_cost,
      forecast: forecast.next_30_days,
      savings: cacheStats.cost_saved,
    },
    cache: {
      hit_rate: cacheStats.hit_rate * 100,
      savings: cacheStats.cost_saved,
    },
    gaps: {
      count: gapReport.gaps.length,
      top_topics: gapReport.gaps.slice(0, 3).map(g => g.topic),
    },
    intelligence: {
      sentiment_avg: aggregateAnalytics.avg_sentiment,
      top_intents: aggregateAnalytics.top_intents.slice(0, 3).map(i => i.intent),
    },
  };
}

/**
 * Process a RAG query through the full LLMOps pipeline
 */
export async function processWithLLMOps(params: {
  query: string;
  tenantId: string;
  sessionId: string;
  ragFn: (query: string, threshold: number) => Promise<{ answer: string; confidence: number; sources: any[] }>;
  llmFn?: (query: string, context: string) => Promise<{ answer: string; confidence: number }>;
}): Promise<{
  answer: string;
  confidence: number;
  quality: import('./response-quality-analyzer').QualityMetrics;
  model_used: string;
  cost: number;
  from_cache: boolean;
}> {
  const { createFallbackChain } = await import('./smart-fallback-chain');
  const { modelOrchestrator } = await import('./multi-model-orchestrator');
  const { costPredictor } = await import('./cost-predictor');
  const { knowledgeGapDetector } = await import('./knowledge-gap-detector');
  
  const startTime = Date.now();
  
  // Route to best model
  const routing = await modelOrchestrator.routeQuery({
    query: params.query,
    tenantId: params.tenantId,
  });
  
  // Execute with fallback chain
  const fallbackChain = createFallbackChain();
  const result = await fallbackChain.execute(
    {
      query: params.query,
      tenantId: params.tenantId,
      sessionId: params.sessionId,
    },
    params.ragFn,
    params.llmFn
  );
  
  // Prefer provider-reported usage when available; fall back to heuristics
  const inputTokens = (result as any)?.usage?.promptTokens ?? Math.ceil(params.query.length / 4);
  const outputTokens = (result as any)?.usage?.completionTokens ?? Math.ceil(result.answer.length / 4);
  const totalTokens = (result as any)?.usage?.totalTokens ?? (inputTokens + outputTokens);

  await costPredictor.recordUsage({
    timestamp: new Date().toISOString(),
    tenant_id: params.tenantId,
    model: routing.selected_model.id,
    provider: routing.selected_model.provider,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    request_type: 'chat',
    latency_ms: Date.now() - startTime,
    cached: result.fallback_level === 'primary_rag' && result.confidence > 0.9,
  });
  
  // Track for knowledge gaps
  if (result.confidence < 0.75) {
    await knowledgeGapDetector.recordLowConfidenceQuery({
      query: params.query,
      tenantId: params.tenantId,
      confidence: result.confidence,
      fallbackUsed: result.fallback_level !== 'primary_rag',
    });
  }
  
  return {
    answer: result.answer,
    confidence: result.confidence,
    quality: result.quality_metrics!,
    model_used: routing.selected_model.id,
    cost: routing.estimated_cost,
    from_cache: false, // Would check actual cache status
  };
}

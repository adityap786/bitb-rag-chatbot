/**
 * LLM Cost Predictor & Budget Manager - LLMOps Feature #7
 * 
 * "Never get surprised by AI bills again"
 * 
 * Users LOVE this because it gives them control and predictability.
 * Shows real-time costs, forecasts, and alerts before overspending.
 * 
 * Features:
 * - Real-time cost tracking per model/provider
 * - Budget alerts and automatic throttling
 * - Cost forecasting based on usage patterns
 * - Cost optimization recommendations
 * - ROI calculator (cost vs value generated)
 * 
 * @module llmops/cost-predictor
 */

import { logger } from '../observability/logger';

// ============================================================================
// Types
// ============================================================================

export interface ModelPricing {
  model: string;
  provider: 'openai' | 'groq' | 'anthropic' | 'cohere' | 'local';
  input_cost_per_1k: number;  // Cost per 1000 input tokens
  output_cost_per_1k: number; // Cost per 1000 output tokens
  embedding_cost_per_1k?: number;
}

export interface UsageRecord {
  timestamp: string;
  tenant_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  embedding_tokens?: number;
  cost: number;
  request_type: 'chat' | 'embedding' | 'completion';
  latency_ms: number;
  cached: boolean;
}

export interface BudgetConfig {
  tenant_id: string;
  daily_limit: number;
  monthly_limit: number;
  alert_threshold: number; // 0-1, e.g., 0.8 for 80%
  auto_throttle: boolean;
  throttle_threshold: number; // 0-1
  email_alerts: string[];
}

export interface CostSummary {
  period: 'today' | 'this_week' | 'this_month';
  total_cost: number;
  total_requests: number;
  total_tokens: number;
  
  by_model: Array<{
    model: string;
    cost: number;
    requests: number;
    tokens: number;
    percentage: number;
  }>;
  
  by_request_type: {
    chat: { cost: number; requests: number };
    embedding: { cost: number; requests: number };
    completion: { cost: number; requests: number };
  };
  
  cache_savings: number;
  avg_cost_per_request: number;
  
  // Budget status
  budget_used_percent: number;
  remaining_budget: number;
  projected_end_of_period: number;
  
  // Alerts
  alerts: Array<{
    type: 'warning' | 'critical';
    message: string;
  }>;
}

export interface CostForecast {
  next_7_days: number;
  next_30_days: number;
  confidence: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  factors: string[];
  
  // Scenarios
  scenarios: {
    optimistic: number;
    realistic: number;
    pessimistic: number;
  };
}

export interface CostOptimization {
  current_cost: number;
  optimized_cost: number;
  savings: number;
  savings_percent: number;
  recommendations: Array<{
    action: string;
    impact: number;
    effort: 'low' | 'medium' | 'high';
    description: string;
  }>;
}

// ============================================================================
// Model Pricing Database
// ============================================================================

const MODEL_PRICING: ModelPricing[] = [
  // OpenAI
  { model: 'gpt-4o', provider: 'openai', input_cost_per_1k: 0.005, output_cost_per_1k: 0.015 },
  { model: 'gpt-4o-mini', provider: 'openai', input_cost_per_1k: 0.00015, output_cost_per_1k: 0.0006 },
  { model: 'gpt-4-turbo', provider: 'openai', input_cost_per_1k: 0.01, output_cost_per_1k: 0.03 },
  { model: 'gpt-3.5-turbo', provider: 'openai', input_cost_per_1k: 0.0005, output_cost_per_1k: 0.0015 },
  { model: 'text-embedding-ada-002', provider: 'openai', input_cost_per_1k: 0, output_cost_per_1k: 0, embedding_cost_per_1k: 0.0001 },
  { model: 'text-embedding-3-small', provider: 'openai', input_cost_per_1k: 0, output_cost_per_1k: 0, embedding_cost_per_1k: 0.00002 },
  { model: 'text-embedding-3-large', provider: 'openai', input_cost_per_1k: 0, output_cost_per_1k: 0, embedding_cost_per_1k: 0.00013 },
  
  // Groq (much cheaper!)
  { model: 'llama-3-groq-70b-8192-tool-use-preview', provider: 'groq', input_cost_per_1k: 0.00059, output_cost_per_1k: 0.00079 },
  { model: 'llama-3.1-70b-versatile', provider: 'groq', input_cost_per_1k: 0.00059, output_cost_per_1k: 0.00079 },
  { model: 'llama-3.1-8b-instant', provider: 'groq', input_cost_per_1k: 0.00005, output_cost_per_1k: 0.00008 },
  { model: 'mixtral-8x7b-32768', provider: 'groq', input_cost_per_1k: 0.00024, output_cost_per_1k: 0.00024 },
  
  // Anthropic
  { model: 'claude-3-5-sonnet-20241022', provider: 'anthropic', input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
  { model: 'claude-3-haiku-20240307', provider: 'anthropic', input_cost_per_1k: 0.00025, output_cost_per_1k: 0.00125 },
  
  // Local (free)
  { model: 'local-llama', provider: 'local', input_cost_per_1k: 0, output_cost_per_1k: 0 },
];

// ============================================================================
// Cost Predictor Engine
// ============================================================================

export class LLMCostPredictor {
  private static instance: LLMCostPredictor;
  
  // Usage history
  private usageHistory: UsageRecord[] = [];
  private budgets = new Map<string, BudgetConfig>();
  
  static getInstance(): LLMCostPredictor {
    if (!LLMCostPredictor.instance) {
      LLMCostPredictor.instance = new LLMCostPredictor();
    }
    return LLMCostPredictor.instance;
  }

  /**
   * Calculate cost for a request
   */
  calculateCost(params: {
    model: string;
    provider?: string;
    inputTokens: number;
    outputTokens: number;
    embeddingTokens?: number;
  }): number {
    const pricing = MODEL_PRICING.find(p => 
      p.model === params.model || 
      p.model.includes(params.model)
    );
    
    if (!pricing) {
      logger.warn('Unknown model pricing', { model: params.model });
      return 0;
    }
    
    let cost = 0;
    cost += (params.inputTokens / 1000) * pricing.input_cost_per_1k;
    cost += (params.outputTokens / 1000) * pricing.output_cost_per_1k;
    
    if (params.embeddingTokens && pricing.embedding_cost_per_1k) {
      cost += (params.embeddingTokens / 1000) * pricing.embedding_cost_per_1k;
    }
    
    return cost;
  }

  /**
   * Record usage
   */
  async recordUsage(record: Omit<UsageRecord, 'cost'>): Promise<UsageRecord> {
    const cost = record.cached ? 0 : this.calculateCost({
      model: record.model,
      inputTokens: record.input_tokens,
      outputTokens: record.output_tokens,
      embeddingTokens: record.embedding_tokens,
    });
    
    const fullRecord: UsageRecord = { ...record, cost };
    this.usageHistory.push(fullRecord);
    
    // Keep last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.usageHistory = this.usageHistory.filter(r => 
      new Date(r.timestamp).getTime() > thirtyDaysAgo
    );
    
    // Check budget alerts
    await this.checkBudgetAlerts(record.tenant_id);
    
    return fullRecord;
  }

  /**
   * Set budget for tenant
   */
  async setBudget(config: BudgetConfig): Promise<void> {
    this.budgets.set(config.tenant_id, config);
    logger.info('Budget configured', { 
      tenantId: config.tenant_id, 
      dailyLimit: config.daily_limit,
      monthlyLimit: config.monthly_limit,
    });
  }

  /**
   * Check if request should be throttled
   */
  async shouldThrottle(tenantId: string): Promise<{ throttle: boolean; reason?: string }> {
    const budget = this.budgets.get(tenantId);
    if (!budget || !budget.auto_throttle) {
      return { throttle: false };
    }
    
    const summary = await this.getCostSummary(tenantId, 'today');
    
    if (summary.budget_used_percent >= budget.throttle_threshold * 100) {
      return {
        throttle: true,
        reason: `Daily budget ${Math.round(summary.budget_used_percent)}% used (throttle at ${budget.throttle_threshold * 100}%)`,
      };
    }
    
    return { throttle: false };
  }

  /**
   * Get cost summary
   */
  async getCostSummary(tenantId: string, period: 'today' | 'this_week' | 'this_month'): Promise<CostSummary> {
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'this_week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }
    
    const records = this.usageHistory.filter(r => 
      r.tenant_id === tenantId &&
      new Date(r.timestamp) >= startDate
    );
    
    const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
    const totalRequests = records.length;
    const totalTokens = records.reduce((sum, r) => 
      sum + r.input_tokens + r.output_tokens + (r.embedding_tokens || 0), 0
    );
    
    // By model breakdown
    const byModelMap = new Map<string, { cost: number; requests: number; tokens: number }>();
    for (const r of records) {
      const existing = byModelMap.get(r.model) || { cost: 0, requests: 0, tokens: 0 };
      existing.cost += r.cost;
      existing.requests += 1;
      existing.tokens += r.input_tokens + r.output_tokens + (r.embedding_tokens || 0);
      byModelMap.set(r.model, existing);
    }
    
    const byModel = Array.from(byModelMap.entries())
      .map(([model, stats]) => ({
        model,
        ...stats,
        percentage: totalCost > 0 ? (stats.cost / totalCost) * 100 : 0,
      }))
      .sort((a, b) => b.cost - a.cost);
    
    // By request type
    const byRequestType = {
      chat: { cost: 0, requests: 0 },
      embedding: { cost: 0, requests: 0 },
      completion: { cost: 0, requests: 0 },
    };
    for (const r of records) {
      byRequestType[r.request_type].cost += r.cost;
      byRequestType[r.request_type].requests += 1;
    }
    
    // Cache savings
    const cachedRecords = records.filter(r => r.cached);
    const cacheSavings = cachedRecords.length > 0 
      ? cachedRecords.reduce((sum, r) => {
          // Estimate what it would have cost without cache
          return sum + this.calculateCost({
            model: r.model,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
          });
        }, 0)
      : 0;
    
    // Budget calculations
    const budget = this.budgets.get(tenantId);
    const budgetLimit = period === 'today' 
      ? budget?.daily_limit || 100 
      : budget?.monthly_limit || 3000;
    
    const budgetUsedPercent = (totalCost / budgetLimit) * 100;
    const remainingBudget = Math.max(0, budgetLimit - totalCost);
    
    // Project end of period cost
    const daysInPeriod = period === 'today' ? 1 : period === 'this_week' ? 7 : 30;
    const daysPassed = period === 'today' ? 1 : Math.ceil((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const dailyAvg = daysPassed > 0 ? totalCost / daysPassed : 0;
    const projectedEnd = dailyAvg * daysInPeriod;
    
    // Alerts
    const alerts: CostSummary['alerts'] = [];
    if (budgetUsedPercent >= 90) {
      alerts.push({ type: 'critical', message: `${Math.round(budgetUsedPercent)}% of budget used` });
    } else if (budgetUsedPercent >= 75) {
      alerts.push({ type: 'warning', message: `${Math.round(budgetUsedPercent)}% of budget used` });
    }
    if (projectedEnd > budgetLimit * 1.2) {
      alerts.push({ type: 'warning', message: `Projected to exceed budget by ${Math.round((projectedEnd / budgetLimit - 1) * 100)}%` });
    }
    
    return {
      period,
      total_cost: totalCost,
      total_requests: totalRequests,
      total_tokens: totalTokens,
      by_model: byModel,
      by_request_type: byRequestType,
      cache_savings: cacheSavings,
      avg_cost_per_request: totalRequests > 0 ? totalCost / totalRequests : 0,
      budget_used_percent: budgetUsedPercent,
      remaining_budget: remainingBudget,
      projected_end_of_period: projectedEnd,
      alerts,
    };
  }

  /**
   * Forecast future costs
   */
  async getForecast(tenantId: string): Promise<CostForecast> {
    const last30Days = this.usageHistory.filter(r => 
      r.tenant_id === tenantId &&
      new Date(r.timestamp).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
    );
    
    if (last30Days.length < 7) {
      return {
        next_7_days: 0,
        next_30_days: 0,
        confidence: 0.3,
        trend: 'stable',
        factors: ['Insufficient data for accurate forecast'],
        scenarios: { optimistic: 0, realistic: 0, pessimistic: 0 },
      };
    }
    
    // Calculate daily costs
    const dailyCosts = new Map<string, number>();
    for (const r of last30Days) {
      const date = new Date(r.timestamp).toISOString().split('T')[0];
      dailyCosts.set(date, (dailyCosts.get(date) || 0) + r.cost);
    }
    
    const costs = Array.from(dailyCosts.values());
    const avgDaily = costs.reduce((a, b) => a + b, 0) / costs.length;
    
    // Trend analysis (simple linear regression)
    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (costs.length >= 7) {
      const firstHalf = costs.slice(0, Math.floor(costs.length / 2));
      const secondHalf = costs.slice(Math.floor(costs.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      const change = ((secondAvg - firstAvg) / firstAvg) * 100;
      if (change > 10) trend = 'increasing';
      else if (change < -10) trend = 'decreasing';
    }
    
    // Scenarios
    const stdDev = Math.sqrt(
      costs.reduce((sum, c) => sum + Math.pow(c - avgDaily, 2), 0) / costs.length
    );
    
    const next7Days = avgDaily * 7;
    const next30Days = avgDaily * 30;
    
    // Factors affecting forecast
    const factors: string[] = [];
    if (trend === 'increasing') factors.push('Usage trending upward');
    if (trend === 'decreasing') factors.push('Usage trending downward');
    if (stdDev > avgDaily * 0.5) factors.push('High variability in usage');
    
    return {
      next_7_days: next7Days,
      next_30_days: next30Days,
      confidence: costs.length >= 14 ? 0.8 : 0.5,
      trend,
      factors,
      scenarios: {
        optimistic: next30Days * 0.7,
        realistic: next30Days,
        pessimistic: next30Days * 1.5,
      },
    };
  }

  /**
   * Get cost optimization recommendations
   */
  async getOptimizations(tenantId: string): Promise<CostOptimization> {
    const summary = await this.getCostSummary(tenantId, 'this_month');
    const recommendations: CostOptimization['recommendations'] = [];
    
    // Analyze model usage
    for (const model of summary.by_model) {
      // Check if using expensive model for simple queries
      if (model.model.includes('gpt-4') && model.requests > 100) {
        const cheaper = MODEL_PRICING.find(p => p.model === 'gpt-4o-mini');
        if (cheaper) {
          const savings = model.cost * 0.5; // Estimate 50% savings
          recommendations.push({
            action: `Switch ${Math.round(model.requests * 0.5)} queries from ${model.model} to gpt-4o-mini`,
            impact: savings,
            effort: 'low',
            description: 'Use cheaper model for simple queries, keep expensive model for complex ones',
          });
        }
      }
      
      // Check if using OpenAI when Groq is available
      if (model.model.includes('gpt') && !model.model.includes('mini')) {
        recommendations.push({
          action: 'Consider Groq Llama models for 60-80% cost reduction',
          impact: model.cost * 0.7,
          effort: 'medium',
          description: 'Groq offers comparable quality at fraction of the cost',
        });
      }
    }
    
    // Cache optimization
    const cacheRate = summary.cache_savings / (summary.total_cost + summary.cache_savings);
    if (cacheRate < 0.2) {
      recommendations.push({
        action: 'Increase semantic cache TTL',
        impact: summary.total_cost * 0.15,
        effort: 'low',
        description: 'Many repeated queries could be cached',
      });
    }
    
    // Embedding optimization
    if (summary.by_request_type.embedding.cost > summary.total_cost * 0.3) {
      recommendations.push({
        action: 'Switch to text-embedding-3-small',
        impact: summary.by_request_type.embedding.cost * 0.8,
        effort: 'medium',
        description: 'Newer embedding model is cheaper and often better',
      });
    }
    
    // Sort by impact
    recommendations.sort((a, b) => b.impact - a.impact);
    
    const potentialSavings = recommendations.reduce((sum, r) => sum + r.impact, 0);
    
    return {
      current_cost: summary.total_cost,
      optimized_cost: summary.total_cost - potentialSavings,
      savings: potentialSavings,
      savings_percent: (potentialSavings / summary.total_cost) * 100,
      recommendations: recommendations.slice(0, 5),
    };
  }

  /**
   * Check and send budget alerts
   */
  private async checkBudgetAlerts(tenantId: string): Promise<void> {
    const budget = this.budgets.get(tenantId);
    if (!budget) return;
    
    const summary = await this.getCostSummary(tenantId, 'today');
    
    if (summary.budget_used_percent >= budget.alert_threshold * 100) {
      logger.warn('Budget alert triggered', {
        tenantId,
        usedPercent: summary.budget_used_percent,
        threshold: budget.alert_threshold * 100,
      });
      
      // Would send email/webhook here
      // await this.sendAlertEmail(budget.email_alerts, summary);
    }
  }

  /**
   * Get ROI metrics
   */
  async getROI(tenantId: string): Promise<{
    total_cost: number;
    queries_handled: number;
    estimated_human_cost_saved: number;
    roi_multiplier: number;
    cost_per_query: number;
    human_equivalent_hours: number;
  }> {
    const summary = await this.getCostSummary(tenantId, 'this_month');
    
    // Estimate human cost (average support agent: $25/hour, 20 queries/hour)
    const humanCostPerQuery = 25 / 20; // $1.25 per query
    const estimatedHumanCost = summary.total_requests * humanCostPerQuery;
    
    return {
      total_cost: summary.total_cost,
      queries_handled: summary.total_requests,
      estimated_human_cost_saved: estimatedHumanCost,
      roi_multiplier: estimatedHumanCost / Math.max(summary.total_cost, 0.01),
      cost_per_query: summary.avg_cost_per_request,
      human_equivalent_hours: summary.total_requests / 20,
    };
  }
}

// Export singleton
export const costPredictor = LLMCostPredictor.getInstance();

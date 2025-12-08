/**
 * Prompt A/B Testing Framework - LLMOps Feature #4
 * 
 * "Know which AI personality makes more sales"
 * 
 * This is the feature that pays for itself by proving ROI.
 * Users can test different prompts and see actual revenue impact.
 * 
 * Features:
 * - Create prompt variants with traffic allocation
 * - Statistical significance testing
 * - Revenue and conversion attribution
 * - Automatic winner selection
 * - Gradual rollout
 * 
 * @module llmops/prompt-ab-testing
 */

import crypto from 'crypto';
import { logger } from '../observability/logger';

// ============================================================================
// Types
// ============================================================================

export interface PromptVariant {
  id: string;
  name: string;
  prompt_template: string;
  system_prompt?: string;
  traffic_allocation: number; // 0-100, must sum to 100 across variants
  is_control: boolean;
  created_at: string;
  
  // Customizations
  temperature?: number;
  max_tokens?: number;
  model_override?: string;
}

export interface ABTest {
  test_id: string;
  tenant_id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'archived';
  
  // Variants
  variants: PromptVariant[];
  
  // Goals
  primary_metric: 'satisfaction' | 'conversion' | 'engagement' | 'resolution_rate';
  secondary_metrics: string[];
  
  // Statistical settings
  min_sample_size: number;
  confidence_level: number; // e.g., 0.95 for 95%
  
  // Timeline
  start_date: string;
  end_date?: string;
  
  // Auto-actions
  auto_select_winner: boolean;
  rollout_winner: boolean;
}

export interface VariantResult {
  variant_id: string;
  impressions: number;
  conversions: number;
  revenue: number;
  satisfaction_sum: number;
  engagement_sum: number;
  
  // Calculated metrics
  conversion_rate: number;
  avg_satisfaction: number;
  avg_engagement: number;
  revenue_per_session: number;
}

export interface ABTestResults {
  test_id: string;
  status: 'insufficient_data' | 'no_winner' | 'winner_found' | 'tie';
  
  // Per-variant results
  variant_results: VariantResult[];
  
  // Winner info
  winner_id?: string;
  winner_improvement?: number; // Percentage improvement over control
  confidence: number;
  
  // Statistical analysis
  p_value: number;
  is_significant: boolean;
  sample_size_met: boolean;
  
  // Recommendations
  recommendation: string;
  next_steps: string[];
}

// ============================================================================
// A/B Testing Engine
// ============================================================================

export class PromptABTestingEngine {
  private static instance: PromptABTestingEngine;
  
  // In-memory storage (replace with Supabase in production)
  private tests = new Map<string, ABTest>();
  private results = new Map<string, Map<string, VariantResult>>();
  
  static getInstance(): PromptABTestingEngine {
    if (!PromptABTestingEngine.instance) {
      PromptABTestingEngine.instance = new PromptABTestingEngine();
    }
    return PromptABTestingEngine.instance;
  }

  /**
   * Create a new A/B test
   */
  async createTest(params: {
    tenantId: string;
    name: string;
    description: string;
    variants: Omit<PromptVariant, 'id' | 'created_at'>[];
    primaryMetric: ABTest['primary_metric'];
    minSampleSize?: number;
    confidenceLevel?: number;
  }): Promise<ABTest> {
    // Validate traffic allocation
    const totalAllocation = params.variants.reduce((sum, v) => sum + v.traffic_allocation, 0);
    if (Math.abs(totalAllocation - 100) > 0.01) {
      throw new Error(`Traffic allocation must sum to 100, got ${totalAllocation}`);
    }
    
    // Ensure exactly one control
    const controls = params.variants.filter(v => v.is_control);
    if (controls.length !== 1) {
      throw new Error('Exactly one variant must be marked as control');
    }
    
    const testId = `abt_${crypto.randomBytes(8).toString('hex')}`;
    
    const variants: PromptVariant[] = params.variants.map(v => ({
      ...v,
      id: `var_${crypto.randomBytes(4).toString('hex')}`,
      created_at: new Date().toISOString(),
    }));
    
    const test: ABTest = {
      test_id: testId,
      tenant_id: params.tenantId,
      name: params.name,
      description: params.description,
      status: 'draft',
      variants,
      primary_metric: params.primaryMetric,
      secondary_metrics: [],
      min_sample_size: params.minSampleSize || 100,
      confidence_level: params.confidenceLevel || 0.95,
      start_date: new Date().toISOString(),
      auto_select_winner: true,
      rollout_winner: false,
    };
    
    this.tests.set(testId, test);
    
    // Initialize results tracking
    const variantResults = new Map<string, VariantResult>();
    for (const variant of variants) {
      variantResults.set(variant.id, {
        variant_id: variant.id,
        impressions: 0,
        conversions: 0,
        revenue: 0,
        satisfaction_sum: 0,
        engagement_sum: 0,
        conversion_rate: 0,
        avg_satisfaction: 0,
        avg_engagement: 0,
        revenue_per_session: 0,
      });
    }
    this.results.set(testId, variantResults);
    
    logger.info('A/B test created', { testId, tenantId: params.tenantId, name: params.name });
    
    return test;
  }

  /**
   * Start a test
   */
  async startTest(testId: string): Promise<ABTest> {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test not found: ${testId}`);
    
    test.status = 'running';
    test.start_date = new Date().toISOString();
    
    logger.info('A/B test started', { testId });
    return test;
  }

  /**
   * Get variant for a session (deterministic assignment)
   */
  async getVariant(testId: string, sessionId: string): Promise<PromptVariant | null> {
    const test = this.tests.get(testId);
    if (!test || test.status !== 'running') return null;
    
    // Deterministic assignment based on session ID hash
    const hash = crypto.createHash('md5').update(sessionId + testId).digest('hex');
    const bucket = parseInt(hash.substring(0, 8), 16) % 100;
    
    // Assign to variant based on traffic allocation
    let cumulativeAllocation = 0;
    for (const variant of test.variants) {
      cumulativeAllocation += variant.traffic_allocation;
      if (bucket < cumulativeAllocation) {
        return variant;
      }
    }
    
    // Fallback to control
    return test.variants.find(v => v.is_control) || test.variants[0];
  }

  /**
   * Record an impression (variant was shown)
   */
  async recordImpression(testId: string, variantId: string): Promise<void> {
    const variantResults = this.results.get(testId);
    if (!variantResults) return;
    
    const result = variantResults.get(variantId);
    if (result) {
      result.impressions++;
      this.updateCalculatedMetrics(result);
    }
  }

  /**
   * Record a conversion (user took desired action)
   */
  async recordConversion(
    testId: string,
    variantId: string,
    revenue?: number,
    satisfaction?: number,
    engagement?: number
  ): Promise<void> {
    const variantResults = this.results.get(testId);
    if (!variantResults) return;
    
    const result = variantResults.get(variantId);
    if (result) {
      result.conversions++;
      if (revenue) result.revenue += revenue;
      if (satisfaction !== undefined) result.satisfaction_sum += satisfaction;
      if (engagement !== undefined) result.engagement_sum += engagement;
      this.updateCalculatedMetrics(result);
    }
    
    // Check if we should auto-complete
    await this.checkAutoComplete(testId);
  }

  /**
   * Update calculated metrics
   */
  private updateCalculatedMetrics(result: VariantResult): void {
    result.conversion_rate = result.impressions > 0 
      ? result.conversions / result.impressions 
      : 0;
    result.avg_satisfaction = result.conversions > 0 
      ? result.satisfaction_sum / result.conversions 
      : 0;
    result.avg_engagement = result.conversions > 0 
      ? result.engagement_sum / result.conversions 
      : 0;
    result.revenue_per_session = result.impressions > 0 
      ? result.revenue / result.impressions 
      : 0;
  }

  /**
   * Get test results with statistical analysis
   */
  async getResults(testId: string): Promise<ABTestResults> {
    const test = this.tests.get(testId);
    const variantResults = this.results.get(testId);
    
    if (!test || !variantResults) {
      throw new Error(`Test not found: ${testId}`);
    }
    
    const results = Array.from(variantResults.values());
    const control = results.find(r => {
      const variant = test.variants.find(v => v.id === r.variant_id);
      return variant?.is_control;
    });
    
    if (!control) {
      throw new Error('Control variant not found');
    }
    
    // Check sample size
    const totalImpressions = results.reduce((sum, r) => sum + r.impressions, 0);
    const sampleSizeMet = totalImpressions >= test.min_sample_size * test.variants.length;
    
    if (!sampleSizeMet) {
      return {
        test_id: testId,
        status: 'insufficient_data',
        variant_results: results,
        confidence: 0,
        p_value: 1,
        is_significant: false,
        sample_size_met: false,
        recommendation: `Need ${test.min_sample_size * test.variants.length - totalImpressions} more impressions`,
        next_steps: ['Continue running the test', 'Consider increasing traffic allocation'],
      };
    }
    
    // Calculate statistical significance
    let winner: VariantResult | undefined;
    let bestImprovement = 0;
    let pValue = 1;
    
    for (const variant of results) {
      if (variant.variant_id === control.variant_id) continue;
      
      // Two-proportion z-test
      const { zScore, p } = this.calculateZTest(
        control.conversions, control.impressions,
        variant.conversions, variant.impressions
      );
      
      if (p < pValue && variant.conversion_rate > control.conversion_rate) {
        pValue = p;
        winner = variant;
        bestImprovement = ((variant.conversion_rate - control.conversion_rate) / control.conversion_rate) * 100;
      }
    }
    
    const isSignificant = pValue < (1 - test.confidence_level);
    
    // Determine status
    let status: ABTestResults['status'] = 'no_winner';
    if (!sampleSizeMet) status = 'insufficient_data';
    else if (isSignificant && winner) status = 'winner_found';
    else if (Math.abs(bestImprovement) < 5) status = 'tie';
    
    // Generate recommendation
    let recommendation = '';
    const nextSteps: string[] = [];
    
    if (status === 'winner_found') {
      recommendation = `Variant "${test.variants.find(v => v.id === winner!.variant_id)?.name}" outperforms control by ${bestImprovement.toFixed(1)}%`;
      nextSteps.push('Roll out winning variant to 100% traffic');
      nextSteps.push('Archive this test');
      nextSteps.push('Create new test with further optimizations');
    } else if (status === 'tie') {
      recommendation = 'No significant difference between variants';
      nextSteps.push('Consider testing more dramatic changes');
      nextSteps.push('Keep running for more data');
    } else {
      recommendation = 'Continue collecting data';
      nextSteps.push('Wait for more impressions');
    }
    
    return {
      test_id: testId,
      status,
      variant_results: results,
      winner_id: winner?.variant_id,
      winner_improvement: bestImprovement,
      confidence: 1 - pValue,
      p_value: pValue,
      is_significant: isSignificant,
      sample_size_met: sampleSizeMet,
      recommendation,
      next_steps: nextSteps,
    };
  }

  /**
   * Calculate two-proportion z-test
   */
  private calculateZTest(
    conversions1: number, n1: number,
    conversions2: number, n2: number
  ): { zScore: number; p: number } {
    if (n1 === 0 || n2 === 0) return { zScore: 0, p: 1 };
    
    const p1 = conversions1 / n1;
    const p2 = conversions2 / n2;
    const pPooled = (conversions1 + conversions2) / (n1 + n2);
    
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1/n1 + 1/n2));
    if (se === 0) return { zScore: 0, p: 1 };
    
    const zScore = (p2 - p1) / se;
    
    // Approximate p-value using normal CDF
    const p = 2 * (1 - this.normalCDF(Math.abs(zScore)));
    
    return { zScore, p };
  }

  /**
   * Approximate normal CDF
   */
  private normalCDF(z: number): number {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    
    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    
    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Check if test should auto-complete
   */
  private async checkAutoComplete(testId: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test || !test.auto_select_winner) return;
    
    try {
      const results = await this.getResults(testId);
      
      if (results.status === 'winner_found' && results.confidence >= test.confidence_level) {
        test.status = 'completed';
        test.end_date = new Date().toISOString();
        
        logger.info('A/B test auto-completed', {
          testId,
          winnerId: results.winner_id,
          improvement: results.winner_improvement,
        });
        
        // Auto-rollout if enabled
        if (test.rollout_winner && results.winner_id) {
          await this.rolloutWinner(testId, results.winner_id);
        }
      }
    } catch (e) {
      // Ignore errors during auto-check
    }
  }

  /**
   * Roll out winning variant to 100%
   */
  async rolloutWinner(testId: string, variantId: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) return;
    
    // Set winner to 100%, others to 0%
    for (const variant of test.variants) {
      variant.traffic_allocation = variant.id === variantId ? 100 : 0;
    }
    
    test.status = 'archived';
    
    logger.info('Winner rolled out', { testId, variantId });
  }

  /**
   * List all tests for a tenant
   */
  async listTests(tenantId: string): Promise<ABTest[]> {
    return Array.from(this.tests.values())
      .filter(t => t.tenant_id === tenantId)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  }
}

// Export singleton
export const promptABTesting = PromptABTestingEngine.getInstance();

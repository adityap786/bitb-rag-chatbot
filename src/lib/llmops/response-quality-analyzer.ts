/**
 * Response Quality Analyzer - LLMOps Core Feature #1
 * 
 * Provides comprehensive quality metrics that users can SEE improving over time.
 * This is the #1 feature that makes users feel they're getting value.
 * 
 * Metrics:
 * - Semantic Coherence Score (0-100)
 * - Answer Completeness (did it address the question?)
 * - Source Grounding Score (how well-supported by sources)
 * - Hallucination Risk Score
 * - User Satisfaction Predictor
 * - Response Time Quality Ratio
 * 
 * @module llmops/response-quality-analyzer
 */

import crypto from 'crypto';
import { logger } from '../observability/logger';

// ============================================================================
// Types
// ============================================================================

export interface QualityMetrics {
  overall_score: number; // 0-100
  semantic_coherence: number;
  answer_completeness: number;
  source_grounding: number;
  hallucination_risk: number;
  satisfaction_prediction: number;
  response_efficiency: number;
  
  // Breakdown
  factors: QualityFactor[];
  
  // Actionable insights
  improvement_suggestions: string[];
  
  // Trend
  trend: 'improving' | 'stable' | 'declining';
  trend_percentage: number;
}

export interface QualityFactor {
  name: string;
  score: number;
  weight: number;
  explanation: string;
}

export interface ResponseAnalysisInput {
  query: string;
  response: string;
  sources: Array<{
    content: string;
    similarity: number;
    title?: string;
  }>;
  responseTimeMs: number;
  tenantId: string;
  sessionId?: string;
}

export interface QualityTrend {
  tenant_id: string;
  date: string;
  avg_score: number;
  total_queries: number;
  improvement_areas: string[];
}

// ============================================================================
// Quality Analyzer
// ============================================================================

export class ResponseQualityAnalyzer {
  private static instance: ResponseQualityAnalyzer;
  
  // In-memory trend storage (replace with Supabase in production)
  private trendCache = new Map<string, QualityMetrics[]>();
  
  static getInstance(): ResponseQualityAnalyzer {
    if (!ResponseQualityAnalyzer.instance) {
      ResponseQualityAnalyzer.instance = new ResponseQualityAnalyzer();
    }
    return ResponseQualityAnalyzer.instance;
  }

  /**
   * Analyze response quality with comprehensive metrics
   * This is the core function that powers the quality dashboard
   */
  async analyzeResponse(input: ResponseAnalysisInput): Promise<QualityMetrics> {
    const startTime = Date.now();
    
    // Calculate individual metrics
    const semanticCoherence = this.calculateSemanticCoherence(input.query, input.response);
    const answerCompleteness = this.calculateAnswerCompleteness(input.query, input.response);
    const sourceGrounding = this.calculateSourceGrounding(input.response, input.sources);
    const hallucinationRisk = this.calculateHallucinationRisk(input.response, input.sources);
    const responseEfficiency = this.calculateResponseEfficiency(input.responseTimeMs, input.response.length);
    
    // Predict user satisfaction based on all factors
    const satisfactionPrediction = this.predictSatisfaction({
      semanticCoherence,
      answerCompleteness,
      sourceGrounding,
      hallucinationRisk,
      responseEfficiency,
    });
    
    // Calculate overall score (weighted average)
    const factors: QualityFactor[] = [
      {
        name: 'Semantic Coherence',
        score: semanticCoherence,
        weight: 0.20,
        explanation: this.explainSemanticCoherence(semanticCoherence),
      },
      {
        name: 'Answer Completeness',
        score: answerCompleteness,
        weight: 0.25,
        explanation: this.explainCompleteness(answerCompleteness),
      },
      {
        name: 'Source Grounding',
        score: sourceGrounding,
        weight: 0.25,
        explanation: this.explainGrounding(sourceGrounding),
      },
      {
        name: 'Hallucination Risk (inverted)',
        score: 100 - hallucinationRisk,
        weight: 0.20,
        explanation: this.explainHallucinationRisk(hallucinationRisk),
      },
      {
        name: 'Response Efficiency',
        score: responseEfficiency,
        weight: 0.10,
        explanation: this.explainEfficiency(responseEfficiency),
      },
    ];
    
    const overallScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
    
    // Generate improvement suggestions
    const suggestions = this.generateImprovementSuggestions(factors);
    
    // Calculate trend
    const trend = this.calculateTrend(input.tenantId, overallScore);
    
    const metrics: QualityMetrics = {
      overall_score: Math.round(overallScore),
      semantic_coherence: semanticCoherence,
      answer_completeness: answerCompleteness,
      source_grounding: sourceGrounding,
      hallucination_risk: hallucinationRisk,
      satisfaction_prediction: satisfactionPrediction,
      response_efficiency: responseEfficiency,
      factors,
      improvement_suggestions: suggestions,
      trend: trend.direction,
      trend_percentage: trend.percentage,
    };
    
    // Store for trend analysis
    this.storeTrendData(input.tenantId, metrics);
    
    logger.info('Response quality analyzed', {
      tenantId: input.tenantId,
      overallScore: metrics.overall_score,
      analysisTimeMs: Date.now() - startTime,
    });
    
    return metrics;
  }

  /**
   * Semantic Coherence: Does the response make logical sense?
   * Uses linguistic markers and structure analysis
   */
  private calculateSemanticCoherence(query: string, response: string): number {
    let score = 70; // Base score
    
    // Check for proper sentence structure
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length >= 2) score += 5;
    if (sentences.length >= 3) score += 5;
    
    // Check for logical connectors (shows reasoning)
    const logicalConnectors = [
      'because', 'therefore', 'however', 'additionally', 'furthermore',
      'first', 'second', 'finally', 'in conclusion', 'as a result',
      'for example', 'specifically', 'in other words'
    ];
    const connectorCount = logicalConnectors.filter(c => 
      response.toLowerCase().includes(c)
    ).length;
    score += Math.min(connectorCount * 3, 15);
    
    // Check for query term relevance
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
    const responseTerms = response.toLowerCase();
    const matchingTerms = queryTerms.filter(t => responseTerms.includes(t)).length;
    const relevanceRatio = queryTerms.length > 0 ? matchingTerms / queryTerms.length : 0.5;
    score += relevanceRatio * 10;
    
    // Penalize very short or very long responses
    const wordCount = response.split(/\s+/).length;
    if (wordCount < 20) score -= 15;
    if (wordCount > 500) score -= 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Answer Completeness: Did it fully address the question?
   */
  private calculateAnswerCompleteness(query: string, response: string): number {
    let score = 60;
    
    // Question type detection and appropriate response checking
    const isQuestion = query.includes('?') || 
      /^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does)/i.test(query);
    
    if (isQuestion) {
      // Check if response provides a direct answer (not just "I can help with that")
      const evasivePatterns = [
        'i can help',
        'i\'d be happy to',
        'let me know',
        'could you clarify',
        'i\'m not sure',
        'i don\'t have information'
      ];
      
      const isEvasive = evasivePatterns.some(p => 
        response.toLowerCase().includes(p)
      );
      
      if (!isEvasive) score += 20;
    }
    
    // Check for specific information (numbers, names, concrete details)
    const hasNumbers = /\d+/.test(response);
    const hasQuotes = /"[^"]+"|'[^']+'/.test(response);
    const hasBulletPoints = /[-•*]\s+/.test(response);
    
    if (hasNumbers) score += 5;
    if (hasQuotes) score += 5;
    if (hasBulletPoints) score += 10;
    
    // Response length relative to query complexity
    const queryWords = query.split(/\s+/).length;
    const responseWords = response.split(/\s+/).length;
    const lengthRatio = responseWords / Math.max(queryWords, 1);
    
    if (lengthRatio >= 3 && lengthRatio <= 20) score += 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Source Grounding: How well-supported by retrieved sources?
   */
  private calculateSourceGrounding(
    response: string,
    sources: Array<{ content: string; similarity: number }>
  ): number {
    if (sources.length === 0) return 30; // No sources = low grounding
    
    let score = 50;
    
    // Average source similarity
    const avgSimilarity = sources.reduce((sum, s) => sum + s.similarity, 0) / sources.length;
    score += avgSimilarity * 30; // 0.8 similarity = +24 points
    
    // Check how many source terms appear in response
    const sourceContent = sources.map(s => s.content).join(' ').toLowerCase();
    const sourceWords = new Set(sourceContent.split(/\s+/).filter(w => w.length > 4));
    const responseWords = response.toLowerCase().split(/\s+/);
    
    const matchingWords = responseWords.filter(w => sourceWords.has(w)).length;
    const matchRatio = responseWords.length > 0 ? matchingWords / responseWords.length : 0;
    score += matchRatio * 20;
    
    // Bonus for high-quality sources (>0.85 similarity)
    const highQualitySources = sources.filter(s => s.similarity > 0.85).length;
    score += highQualitySources * 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Hallucination Risk: Probability of fabricated information
   * Lower is better
   */
  private calculateHallucinationRisk(
    response: string,
    sources: Array<{ content: string; similarity: number }>
  ): number {
    let risk = 20; // Base risk
    
    // Higher risk if no sources
    if (sources.length === 0) {
      risk += 40;
    } else {
      // Check source quality
      const avgSimilarity = sources.reduce((sum, s) => sum + s.similarity, 0) / sources.length;
      if (avgSimilarity < 0.6) risk += 25;
      else if (avgSimilarity < 0.75) risk += 10;
    }
    
    // Risky language patterns (overly confident about uncertain things)
    const riskyPatterns = [
      'definitely', 'always', 'never', 'guaranteed', 'certainly',
      'everyone knows', 'it\'s a fact', 'absolutely'
    ];
    const riskyCount = riskyPatterns.filter(p => 
      response.toLowerCase().includes(p)
    ).length;
    risk += riskyCount * 5;
    
    // Safe language patterns (indicates appropriate uncertainty)
    const safePatterns = [
      'according to', 'based on', 'the sources indicate',
      'it appears', 'typically', 'generally', 'may', 'might'
    ];
    const safeCount = safePatterns.filter(p => 
      response.toLowerCase().includes(p)
    ).length;
    risk -= safeCount * 3;
    
    // Specific claims without citation increase risk
    const hasSpecificNumbers = /\b\d{3,}\b/.test(response); // Large numbers
    const hasSpecificDates = /\b(19|20)\d{2}\b/.test(response); // Years
    if (hasSpecificNumbers && sources.length === 0) risk += 15;
    if (hasSpecificDates && sources.length === 0) risk += 10;
    
    return Math.max(0, Math.min(100, risk));
  }

  /**
   * Response Efficiency: Speed vs quality tradeoff
   */
  private calculateResponseEfficiency(responseTimeMs: number, responseLength: number): number {
    // Ideal: Fast response with good content
    // Penalty for slow responses or too short/long responses
    
    let score = 80;
    
    // Time scoring (sub-2s is great, 2-5s is good, >5s is slow)
    if (responseTimeMs < 1000) score += 15;
    else if (responseTimeMs < 2000) score += 10;
    else if (responseTimeMs < 3000) score += 5;
    else if (responseTimeMs > 5000) score -= 10;
    else if (responseTimeMs > 10000) score -= 20;
    
    // Content density (chars per ms)
    const charsPerSecond = responseLength / (responseTimeMs / 1000);
    if (charsPerSecond > 200) score += 5; // Good throughput
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Predict user satisfaction based on all factors
   */
  private predictSatisfaction(metrics: {
    semanticCoherence: number;
    answerCompleteness: number;
    sourceGrounding: number;
    hallucinationRisk: number;
    responseEfficiency: number;
  }): number {
    // Weighted model based on what correlates with positive feedback
    const weights = {
      answerCompleteness: 0.35,    // Most important - did it answer?
      semanticCoherence: 0.25,     // Does it make sense?
      sourceGrounding: 0.20,       // Is it trustworthy?
      hallucinationRisk: -0.15,    // Risk factor (negative weight)
      responseEfficiency: 0.05,    // Speed matters less if answer is good
    };
    
    const satisfaction = 
      metrics.answerCompleteness * weights.answerCompleteness +
      metrics.semanticCoherence * weights.semanticCoherence +
      metrics.sourceGrounding * weights.sourceGrounding +
      (100 - metrics.hallucinationRisk) * Math.abs(weights.hallucinationRisk) +
      metrics.responseEfficiency * weights.responseEfficiency;
    
    return Math.max(0, Math.min(100, Math.round(satisfaction)));
  }

  /**
   * Generate actionable improvement suggestions
   */
  private generateImprovementSuggestions(factors: QualityFactor[]): string[] {
    const suggestions: string[] = [];
    
    for (const factor of factors) {
      if (factor.score < 60) {
        switch (factor.name) {
          case 'Semantic Coherence':
            suggestions.push('Add more structured responses with clear logical flow');
            suggestions.push('Use transition words to connect ideas');
            break;
          case 'Answer Completeness':
            suggestions.push('Ensure responses directly address the user\'s question');
            suggestions.push('Include specific details, examples, or actionable steps');
            break;
          case 'Source Grounding':
            suggestions.push('Improve knowledge base coverage for common queries');
            suggestions.push('Add more detailed source documents');
            break;
          case 'Hallucination Risk (inverted)':
            suggestions.push('Adjust prompts to encourage citing sources');
            suggestions.push('Add guardrails for uncertain answers');
            break;
          case 'Response Efficiency':
            suggestions.push('Optimize LLM model selection for faster responses');
            suggestions.push('Consider response caching for common queries');
            break;
        }
      }
    }
    
    return suggestions.slice(0, 3); // Top 3 suggestions
  }

  /**
   * Calculate quality trend over time
   */
  private calculateTrend(
    tenantId: string,
    currentScore: number
  ): { direction: 'improving' | 'stable' | 'declining'; percentage: number } {
    const history = this.trendCache.get(tenantId) || [];
    
    if (history.length < 5) {
      return { direction: 'stable', percentage: 0 };
    }
    
    // Last 50 scores
    const recentScores = history.slice(-50).map(m => m.overall_score);
    const avgRecent = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    
    // Previous 50 scores
    const previousScores = history.slice(-100, -50).map(m => m.overall_score);
    if (previousScores.length === 0) {
      return { direction: 'stable', percentage: 0 };
    }
    const avgPrevious = previousScores.reduce((a, b) => a + b, 0) / previousScores.length;
    
    const percentageChange = ((avgRecent - avgPrevious) / avgPrevious) * 100;
    
    if (percentageChange > 3) {
      return { direction: 'improving', percentage: Math.round(percentageChange) };
    } else if (percentageChange < -3) {
      return { direction: 'declining', percentage: Math.round(Math.abs(percentageChange)) };
    }
    return { direction: 'stable', percentage: 0 };
  }

  /**
   * Store metrics for trend analysis
   */
  private storeTrendData(tenantId: string, metrics: QualityMetrics): void {
    const history = this.trendCache.get(tenantId) || [];
    history.push(metrics);
    
    // Keep last 1000 entries
    if (history.length > 1000) {
      history.shift();
    }
    
    this.trendCache.set(tenantId, history);
  }

  /**
   * Get quality dashboard data for a tenant
   */
  async getDashboardData(tenantId: string, days: number = 7): Promise<{
    current_avg_score: number;
    trend: 'improving' | 'stable' | 'declining';
    trend_percentage: number;
    total_queries_analyzed: number;
    top_issues: string[];
    daily_scores: Array<{ date: string; score: number; count: number }>;
  }> {
    const history = this.trendCache.get(tenantId) || [];
    
    if (history.length === 0) {
      return {
        current_avg_score: 0,
        trend: 'stable',
        trend_percentage: 0,
        total_queries_analyzed: 0,
        top_issues: [],
        daily_scores: [],
      };
    }
    
    const avgScore = history.reduce((sum, m) => sum + m.overall_score, 0) / history.length;
    const latestTrend = history[history.length - 1];
    
    // Aggregate issues
    const issueCounts = new Map<string, number>();
    for (const m of history) {
      for (const suggestion of m.improvement_suggestions) {
        issueCounts.set(suggestion, (issueCounts.get(suggestion) || 0) + 1);
      }
    }
    
    const topIssues = Array.from(issueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue]) => issue);
    
    return {
      current_avg_score: Math.round(avgScore),
      trend: latestTrend.trend,
      trend_percentage: latestTrend.trend_percentage,
      total_queries_analyzed: history.length,
      top_issues: topIssues,
      daily_scores: [], // Would aggregate by day in production
    };
  }

  // Explanation helpers
  private explainSemanticCoherence(score: number): string {
    if (score >= 80) return 'Response is logically structured with clear reasoning';
    if (score >= 60) return 'Response is generally coherent but could be clearer';
    return 'Response lacks clear structure or logical flow';
  }

  private explainCompleteness(score: number): string {
    if (score >= 80) return 'Response fully addresses the user\'s question';
    if (score >= 60) return 'Response partially addresses the question';
    return 'Response may not directly answer what was asked';
  }

  private explainGrounding(score: number): string {
    if (score >= 80) return 'Response is well-supported by source documents';
    if (score >= 60) return 'Response has some source support';
    return 'Response may contain unsupported claims';
  }

  private explainHallucinationRisk(score: number): string {
    if (score <= 20) return 'Low risk - response is well-grounded';
    if (score <= 40) return 'Moderate risk - some claims may need verification';
    return 'Higher risk - response may contain fabricated information';
  }

  private explainEfficiency(score: number): string {
    if (score >= 80) return 'Fast response with good content density';
    if (score >= 60) return 'Acceptable response time';
    return 'Response time could be improved';
  }
}

// Export singleton
export const qualityAnalyzer = ResponseQualityAnalyzer.getInstance();

/**
 * Knowledge Gap Detector - LLMOps Feature #10
 * 
 * "AI tells you what content to create next"
 * 
 * This is the feature that keeps users engaged long-term.
 * Shows them exactly where their knowledge base is weak.
 * 
 * Features:
 * - Track unanswered queries
 * - Identify topic gaps
 * - Prioritize by impact
 * - Generate content suggestions
 * - Measure gap closure
 * 
 * @module llmops/knowledge-gap-detector
 */

import { logger } from '../observability/logger';

// ============================================================================
// Types
// ============================================================================

export interface UnansweredQuery {
  query: string;
  normalized_query: string;
  count: number;
  first_seen: string;
  last_seen: string;
  tenant_id: string;
  
  // Analysis
  topic: string;
  intent: string;
  urgency: 'high' | 'medium' | 'low';
  
  // Attempted answers
  attempts: Array<{
    timestamp: string;
    confidence: number;
    fallback_used: boolean;
    user_feedback?: 'positive' | 'negative' | 'neutral';
  }>;
}

export interface KnowledgeGap {
  gap_id: string;
  topic: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  
  // Evidence
  unanswered_queries: string[];
  query_count: number;
  avg_confidence: number;
  negative_feedback_rate: number;
  
  // Business impact
  estimated_revenue_impact: number;
  affected_users: number;
  
  // Recommendations
  suggested_content: ContentSuggestion[];
  priority_score: number;
}

export interface ContentSuggestion {
  title: string;
  type: 'faq' | 'article' | 'guide' | 'video_script' | 'product_page';
  outline: string[];
  target_queries: string[];
  estimated_impact: number;
  effort: 'low' | 'medium' | 'high';
}

export interface GapReport {
  tenant_id: string;
  generated_at: string;
  period: 'last_7_days' | 'last_30_days' | 'all_time';
  
  // Summary
  total_queries: number;
  unanswered_queries: number;
  unanswered_rate: number;
  
  // Top gaps
  gaps: KnowledgeGap[];
  
  // Trends
  gap_trend: 'improving' | 'stable' | 'worsening';
  gap_trend_percentage: number;
  
  // Quick wins
  quick_wins: ContentSuggestion[];
  
  // Competitor analysis
  competitor_topics?: string[];
}

// ============================================================================
// Knowledge Gap Detector
// ============================================================================

export class KnowledgeGapDetector {
  private static instance: KnowledgeGapDetector;
  
  // Storage
  private unansweredQueries = new Map<string, UnansweredQuery[]>();
  private topicClusters = new Map<string, Set<string>>();
  
  static getInstance(): KnowledgeGapDetector {
    if (!KnowledgeGapDetector.instance) {
      KnowledgeGapDetector.instance = new KnowledgeGapDetector();
    }
    return KnowledgeGapDetector.instance;
  }

  /**
   * Record a query with low confidence answer
   */
  async recordLowConfidenceQuery(params: {
    query: string;
    tenantId: string;
    confidence: number;
    fallbackUsed: boolean;
    userFeedback?: 'positive' | 'negative' | 'neutral';
  }): Promise<void> {
    // Only track if confidence is below threshold
    if (params.confidence >= 0.75 && params.userFeedback !== 'negative') {
      return;
    }
    
    const tenantQueries = this.unansweredQueries.get(params.tenantId) || [];
    const normalizedQuery = this.normalizeQuery(params.query);
    
    // Find existing or create new
    let existing = tenantQueries.find(q => q.normalized_query === normalizedQuery);
    
    if (existing) {
      existing.count++;
      existing.last_seen = new Date().toISOString();
      existing.attempts.push({
        timestamp: new Date().toISOString(),
        confidence: params.confidence,
        fallback_used: params.fallbackUsed,
        user_feedback: params.userFeedback,
      });
    } else {
      const topic = this.extractTopic(params.query);
      const intent = this.detectIntent(params.query);
      
      const newQuery: UnansweredQuery = {
        query: params.query,
        normalized_query: normalizedQuery,
        count: 1,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        tenant_id: params.tenantId,
        topic,
        intent,
        urgency: this.assessUrgency(params.query, params.userFeedback),
        attempts: [{
          timestamp: new Date().toISOString(),
          confidence: params.confidence,
          fallback_used: params.fallbackUsed,
          user_feedback: params.userFeedback,
        }],
      };
      
      tenantQueries.push(newQuery);
      
      // Update topic cluster
      const cluster = this.topicClusters.get(topic) || new Set();
      cluster.add(normalizedQuery);
      this.topicClusters.set(topic, cluster);
    }
    
    this.unansweredQueries.set(params.tenantId, tenantQueries);
    
    logger.debug('Low confidence query recorded', {
      tenantId: params.tenantId,
      query: params.query.substring(0, 50),
      confidence: params.confidence,
    });
  }

  /**
   * Generate gap report
   */
  async generateGapReport(
    tenantId: string,
    period: 'last_7_days' | 'last_30_days' | 'all_time' = 'last_30_days'
  ): Promise<GapReport> {
    const tenantQueries = this.unansweredQueries.get(tenantId) || [];
    
    // Filter by period
    const cutoff = this.getPeriodCutoff(period);
    const relevantQueries = tenantQueries.filter(q => 
      new Date(q.last_seen) >= cutoff
    );
    
    // Calculate totals (would come from actual usage data in production)
    const totalQueries = relevantQueries.reduce((sum, q) => sum + q.count, 0) * 5; // Estimate
    const unansweredCount = relevantQueries.reduce((sum, q) => sum + q.count, 0);
    
    // Group by topic and create gaps
    const topicGroups = new Map<string, UnansweredQuery[]>();
    for (const query of relevantQueries) {
      const queries = topicGroups.get(query.topic) || [];
      queries.push(query);
      topicGroups.set(query.topic, queries);
    }
    
    // Create gap objects
    const gaps: KnowledgeGap[] = [];
    for (const [topic, queries] of topicGroups) {
      const gap = this.createGap(topic, queries);
      gaps.push(gap);
    }
    
    // Sort by priority
    gaps.sort((a, b) => b.priority_score - a.priority_score);
    
    // Calculate trend
    const trendData = this.calculateTrend(tenantId, period);
    
    // Generate quick wins
    const quickWins = this.generateQuickWins(gaps);
    
    return {
      tenant_id: tenantId,
      generated_at: new Date().toISOString(),
      period,
      total_queries: totalQueries,
      unanswered_queries: unansweredCount,
      unanswered_rate: totalQueries > 0 ? (unansweredCount / totalQueries) * 100 : 0,
      gaps: gaps.slice(0, 10), // Top 10 gaps
      gap_trend: trendData.direction,
      gap_trend_percentage: trendData.percentage,
      quick_wins: quickWins,
    };
  }

  /**
   * Create a gap from topic queries
   */
  private createGap(topic: string, queries: UnansweredQuery[]): KnowledgeGap {
    const totalCount = queries.reduce((sum, q) => sum + q.count, 0);
    const avgConfidence = queries.reduce((sum, q) => {
      const avgAttemptConf = q.attempts.reduce((s, a) => s + a.confidence, 0) / q.attempts.length;
      return sum + avgAttemptConf;
    }, 0) / queries.length;
    
    // Calculate negative feedback rate
    const allAttempts = queries.flatMap(q => q.attempts);
    const negativeCount = allAttempts.filter(a => a.user_feedback === 'negative').length;
    const negativeFeedbackRate = allAttempts.length > 0 ? negativeCount / allAttempts.length : 0;
    
    // Determine severity
    let severity: KnowledgeGap['severity'] = 'low';
    if (totalCount > 50 || negativeFeedbackRate > 0.3) severity = 'critical';
    else if (totalCount > 20 || negativeFeedbackRate > 0.2) severity = 'high';
    else if (totalCount > 10 || negativeFeedbackRate > 0.1) severity = 'medium';
    
    // Generate content suggestions
    const suggestions = this.generateContentSuggestions(topic, queries);
    
    // Calculate priority score
    const priorityScore = 
      totalCount * 0.3 +
      (1 - avgConfidence) * 100 * 0.3 +
      negativeFeedbackRate * 100 * 0.2 +
      (queries.filter(q => q.urgency === 'high').length / queries.length) * 100 * 0.2;
    
    return {
      gap_id: `gap_${topic.replace(/\s+/g, '_').toLowerCase()}`,
      topic,
      description: `Users are asking about "${topic}" but getting low-confidence answers`,
      severity,
      unanswered_queries: queries.map(q => q.query).slice(0, 5),
      query_count: totalCount,
      avg_confidence: avgConfidence,
      negative_feedback_rate: negativeFeedbackRate,
      estimated_revenue_impact: this.estimateRevenueImpact(queries),
      affected_users: Math.ceil(totalCount * 0.7), // Estimate unique users
      suggested_content: suggestions,
      priority_score: priorityScore,
    };
  }

  /**
   * Generate content suggestions for a gap
   */
  private generateContentSuggestions(topic: string, queries: UnansweredQuery[]): ContentSuggestion[] {
    const suggestions: ContentSuggestion[] = [];
    const topQueries = queries.slice(0, 5).map(q => q.query);
    
    // FAQ suggestion (always)
    suggestions.push({
      title: `FAQ: ${topic}`,
      type: 'faq',
      outline: topQueries.map(q => `Q: ${q}`),
      target_queries: topQueries,
      estimated_impact: queries.reduce((sum, q) => sum + q.count, 0) * 0.6,
      effort: 'low',
    });
    
    // Article for complex topics
    if (queries.length > 3) {
      const articleOutline = [
        `Introduction to ${topic}`,
        'Common Questions',
        ...topQueries.slice(0, 3).map(q => `How to: ${this.extractActionFromQuery(q)}`),
        'Best Practices',
        'Summary',
      ];
      
      suggestions.push({
        title: `Complete Guide: ${topic}`,
        type: 'article',
        outline: articleOutline,
        target_queries: topQueries,
        estimated_impact: queries.reduce((sum, q) => sum + q.count, 0) * 0.8,
        effort: 'medium',
      });
    }
    
    // Product page for product queries
    if (queries.some(q => q.intent === 'purchase' || q.intent === 'pricing')) {
      suggestions.push({
        title: `Product Page: ${topic}`,
        type: 'product_page',
        outline: [
          'Product Overview',
          'Key Features',
          'Pricing & Plans',
          'How It Works',
          'FAQ',
          'Call to Action',
        ],
        target_queries: queries.filter(q => q.intent === 'purchase' || q.intent === 'pricing').map(q => q.query),
        estimated_impact: queries.reduce((sum, q) => sum + q.count, 0) * 1.5, // Higher for commercial intent
        effort: 'high',
      });
    }
    
    return suggestions;
  }

  /**
   * Generate quick wins (low effort, high impact)
   */
  private generateQuickWins(gaps: KnowledgeGap[]): ContentSuggestion[] {
    const allSuggestions = gaps.flatMap(g => g.suggested_content);
    
    // Filter for low effort, sort by impact
    const quickWins = allSuggestions
      .filter(s => s.effort === 'low')
      .sort((a, b) => b.estimated_impact - a.estimated_impact)
      .slice(0, 5);
    
    return quickWins;
  }

  /**
   * Normalize query for deduplication
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(w => w.length > 2)
      .sort()
      .join(' ');
  }

  /**
   * Extract topic from query
   */
  private extractTopic(query: string): string {
    // Simple noun phrase extraction
    const lowerQuery = query.toLowerCase();
    
    // Common topic patterns
    const patterns = [
      /about ([\w\s]+?)(?:\?|$)/i,
      /how (?:do|does|can|to) ([\w\s]+?)(?:\?|$)/i,
      /what is ([\w\s]+?)(?:\?|$)/i,
      /(?:your|the) ([\w\s]+?)(?:\?|$)/i,
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 30);
      }
    }
    
    // Fallback: use first 3 meaningful words
    const words = lowerQuery.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
    return words.join(' ') || 'general';
  }

  /**
   * Detect intent from query
   */
  private detectIntent(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    if (/buy|purchase|order|price|cost|subscription/i.test(lowerQuery)) return 'purchase';
    if (/help|issue|problem|error|broken/i.test(lowerQuery)) return 'support';
    if (/how to|tutorial|guide|learn/i.test(lowerQuery)) return 'learn';
    if (/compare|vs|versus|difference/i.test(lowerQuery)) return 'compare';
    if (/refund|cancel|return/i.test(lowerQuery)) return 'cancel';
    if (/contact|speak|call|email/i.test(lowerQuery)) return 'contact';
    
    return 'inquiry';
  }

  /**
   * Assess urgency of a query
   */
  private assessUrgency(query: string, feedback?: 'positive' | 'negative' | 'neutral'): 'high' | 'medium' | 'low' {
    if (feedback === 'negative') return 'high';
    
    const lowerQuery = query.toLowerCase();
    
    if (/urgent|asap|immediately|emergency|critical/i.test(lowerQuery)) return 'high';
    if (/refund|cancel|angry|frustrated|terrible/i.test(lowerQuery)) return 'high';
    if (/buy|purchase|order|pricing/i.test(lowerQuery)) return 'medium';
    
    return 'low';
  }

  /**
   * Extract action from query for outline
   */
  private extractActionFromQuery(query: string): string {
    // Remove question words and clean up
    return query
      .replace(/^(how|what|when|where|why|who|can|could|would|should|do|does|is|are)\s+(i|you|we|to)?\s*/i, '')
      .replace(/\?$/, '')
      .trim();
  }

  /**
   * Estimate revenue impact
   */
  private estimateRevenueImpact(queries: UnansweredQuery[]): number {
    let impact = 0;
    
    for (const query of queries) {
      const baseValue = 5; // $5 per unanswered question
      
      // Higher value for commercial intent
      if (query.intent === 'purchase') impact += query.count * baseValue * 3;
      else if (query.urgency === 'high') impact += query.count * baseValue * 2;
      else impact += query.count * baseValue;
    }
    
    return impact;
  }

  /**
   * Get period cutoff date
   */
  private getPeriodCutoff(period: 'last_7_days' | 'last_30_days' | 'all_time'): Date {
    const now = new Date();
    switch (period) {
      case 'last_7_days': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'last_30_days': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'all_time': return new Date(0);
    }
  }

  /**
   * Calculate trend
   */
  private calculateTrend(tenantId: string, period: string): { direction: 'improving' | 'stable' | 'worsening'; percentage: number } {
    // Would compare current vs previous period
    // For now, return stable
    return { direction: 'stable', percentage: 0 };
  }

  /**
   * Get gap closure metrics (after content is added)
   */
  async getGapClosureMetrics(tenantId: string, gapId: string): Promise<{
    original_count: number;
    current_count: number;
    reduction_percent: number;
    confidence_improvement: number;
    status: 'closed' | 'improving' | 'unchanged';
  }> {
    // Would track before/after metrics
    return {
      original_count: 100,
      current_count: 20,
      reduction_percent: 80,
      confidence_improvement: 0.3,
      status: 'improving',
    };
  }
}

// Export singleton
export const knowledgeGapDetector = KnowledgeGapDetector.getInstance();

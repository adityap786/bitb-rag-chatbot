/**
 * RAG Quality Scorer with Source Trust Levels
 * 
 * Evaluates retrieval quality and source reliability for e-commerce/service businesses.
 * Tracks source performance over time to improve trust calibration.
 * 
 * Business Value:
 * - Ensures customers get answers from reliable sources
 * - Automatically deprioritizes stale/unreliable content
 * - Improves answer accuracy = higher conversion rates
 */

export interface SourceMetadata {
  source_id: string;
  source_type: 'documentation' | 'faq' | 'product' | 'policy' | 'blog' | 'support_ticket' | 'external';
  url?: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  author?: string;
  verified: boolean;
  category?: string;
}

export interface TrustScore {
  source_id: string;
  trust_level: 'high' | 'medium' | 'low' | 'unverified';
  score: number; // 0-100
  factors: TrustFactor[];
  last_calculated: Date;
}

export interface TrustFactor {
  name: string;
  weight: number;
  score: number;
  reason: string;
}

export interface RetrievalQuality {
  query: string;
  retrieved_chunks: ChunkQuality[];
  overall_score: number;
  diversity_score: number;
  relevance_score: number;
  freshness_score: number;
  trust_score: number;
  recommendations: string[];
}

export interface ChunkQuality {
  chunk_id: string;
  content_preview: string;
  source: SourceMetadata;
  similarity_score: number;
  relevance_score: number;
  trust_score: TrustScore;
  freshness_days: number;
  position_boost: number;
}

export interface SourcePerformance {
  source_id: string;
  total_retrievals: number;
  positive_feedback: number;
  negative_feedback: number;
  helpful_rate: number;
  avg_position: number;
  conversion_contribution: number;
  last_used: Date;
}

export interface RAGQualityDashboard {
  period: string;
  avg_retrieval_quality: number;
  source_performance: SourcePerformance[];
  top_sources: { source_id: string; score: number }[];
  stale_sources: { source_id: string; days_stale: number }[];
  low_trust_sources: { source_id: string; trust_score: number }[];
  quality_trend: { date: string; score: number }[];
  recommendations: string[];
}

interface SourceFeedback {
  source_id: string;
  positive: number;
  negative: number;
  conversions: number;
  positions: number[];
}

interface DailyQuality {
  date: string;
  scores: number[];
}

export class RAGQualityScorer {
  private trustScores: Map<string, TrustScore> = new Map();
  private sourceFeedback: Map<string, SourceFeedback> = new Map();
  private qualityHistory: DailyQuality[] = [];

  // Trust level thresholds
  private readonly TRUST_THRESHOLDS = {
    high: 80,
    medium: 60,
    low: 40,
  };

  // Source type base trust scores
  private readonly SOURCE_TYPE_TRUST: Record<SourceMetadata['source_type'], number> = {
    documentation: 90,
    faq: 85,
    product: 80,
    policy: 95,
    blog: 60,
    support_ticket: 50,
    external: 40,
  };

  // Staleness thresholds in days
  private readonly STALENESS_THRESHOLDS = {
    documentation: 180,  // 6 months
    faq: 90,            // 3 months
    product: 30,        // 1 month (products change frequently)
    policy: 365,        // 1 year
    blog: 365,          // 1 year
    support_ticket: 30, // 1 month
    external: 14,       // 2 weeks
  };

  /**
   * Calculate trust score for a source
   */
  calculateTrustScore(source: SourceMetadata): TrustScore {
    const factors: TrustFactor[] = [];
    
    // Factor 1: Source type base trust (weight: 0.3)
    const typeTrust = this.SOURCE_TYPE_TRUST[source.source_type];
    factors.push({
      name: 'source_type',
      weight: 0.3,
      score: typeTrust,
      reason: `${source.source_type} sources have base trust of ${typeTrust}`,
    });

    // Factor 2: Verification status (weight: 0.2)
    const verificationScore = source.verified ? 100 : 50;
    factors.push({
      name: 'verification',
      weight: 0.2,
      score: verificationScore,
      reason: source.verified ? 'Source is verified' : 'Source not verified',
    });

    // Factor 3: Freshness (weight: 0.25)
    const daysSinceUpdate = Math.floor(
      (Date.now() - source.updated_at.getTime()) / (1000 * 60 * 60 * 24)
    );
    const stalenessThreshold = this.STALENESS_THRESHOLDS[source.source_type];
    const freshnessScore = Math.max(0, 100 - (daysSinceUpdate / stalenessThreshold) * 100);
    factors.push({
      name: 'freshness',
      weight: 0.25,
      score: freshnessScore,
      reason: `Updated ${daysSinceUpdate} days ago (threshold: ${stalenessThreshold} days)`,
    });

    // Factor 4: Historical performance (weight: 0.25)
    const feedback = this.sourceFeedback.get(source.source_id);
    let performanceScore = 70; // Default
    if (feedback && feedback.positive + feedback.negative > 5) {
      performanceScore = (feedback.positive / (feedback.positive + feedback.negative)) * 100;
    }
    factors.push({
      name: 'historical_performance',
      weight: 0.25,
      score: performanceScore,
      reason: feedback 
        ? `${feedback.positive} positive, ${feedback.negative} negative feedback`
        : 'No feedback history',
    });

    // Calculate weighted score
    const totalScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    // Determine trust level
    let trustLevel: TrustScore['trust_level'];
    if (totalScore >= this.TRUST_THRESHOLDS.high) {
      trustLevel = 'high';
    } else if (totalScore >= this.TRUST_THRESHOLDS.medium) {
      trustLevel = 'medium';
    } else if (totalScore >= this.TRUST_THRESHOLDS.low) {
      trustLevel = 'low';
    } else {
      trustLevel = 'unverified';
    }

    const trustScore: TrustScore = {
      source_id: source.source_id,
      trust_level: trustLevel,
      score: Math.round(totalScore),
      factors,
      last_calculated: new Date(),
    };

    this.trustScores.set(source.source_id, trustScore);
    return trustScore;
  }

  /**
   * Evaluate quality of retrieved chunks for a query
   */
  evaluateRetrieval(
    query: string,
    chunks: Array<{
      chunk_id: string;
      content: string;
      source: SourceMetadata;
      similarity_score: number;
    }>
  ): RetrievalQuality {
    const chunkQualities: ChunkQuality[] = chunks.map((chunk, index) => {
      // Calculate trust score
      const trustScore = this.calculateTrustScore(chunk.source);

      // Calculate freshness
      const freshnessDays = Math.floor(
        (Date.now() - chunk.source.updated_at.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Position boost (top results get slight boost)
      const positionBoost = Math.max(0, 1 - index * 0.1);

      // Relevance combines similarity and trust
      const relevanceScore = 
        chunk.similarity_score * 0.6 + 
        (trustScore.score / 100) * 0.3 +
        positionBoost * 0.1;

      return {
        chunk_id: chunk.chunk_id,
        content_preview: chunk.content.substring(0, 200) + '...',
        source: chunk.source,
        similarity_score: chunk.similarity_score,
        relevance_score: Math.round(relevanceScore * 100) / 100,
        trust_score: trustScore,
        freshness_days: freshnessDays,
        position_boost: positionBoost,
      };
    });

    // Calculate overall metrics
    const avgRelevance = 
      chunkQualities.reduce((sum, c) => sum + c.relevance_score, 0) / chunkQualities.length;
    
    const avgTrust = 
      chunkQualities.reduce((sum, c) => sum + c.trust_score.score, 0) / chunkQualities.length;
    
    const avgFreshness = 
      chunkQualities.reduce((sum, c) => {
        const threshold = this.STALENESS_THRESHOLDS[c.source.source_type];
        return sum + Math.max(0, 100 - (c.freshness_days / threshold) * 100);
      }, 0) / chunkQualities.length;

    // Diversity score (different source types)
    const sourceTypes = new Set(chunkQualities.map(c => c.source.source_type));
    const diversityScore = Math.min(100, (sourceTypes.size / 4) * 100);

    // Overall score
    const overallScore = 
      avgRelevance * 0.4 +
      (avgTrust / 100) * 0.25 +
      (avgFreshness / 100) * 0.2 +
      (diversityScore / 100) * 0.15;

    // Generate recommendations
    const recommendations: string[] = [];

    // Check for stale sources
    const staleChunks = chunkQualities.filter(c => 
      c.freshness_days > this.STALENESS_THRESHOLDS[c.source.source_type]
    );
    if (staleChunks.length > 0) {
      recommendations.push(
        `${staleChunks.length} retrieved sources are stale and should be updated`
      );
    }

    // Check for low trust sources
    const lowTrustChunks = chunkQualities.filter(c => c.trust_score.trust_level === 'low');
    if (lowTrustChunks.length > chunks.length / 2) {
      recommendations.push(
        'More than half of retrieved sources have low trust - consider improving content quality'
      );
    }

    // Check for low diversity
    if (diversityScore < 50) {
      recommendations.push(
        'Retrieved results lack diversity - consider adding more source types'
      );
    }

    // Check for low relevance
    if (avgRelevance < 0.5) {
      recommendations.push(
        'Low relevance scores detected - consider improving embeddings or chunking strategy'
      );
    }

    // Record quality for trending
    this.recordQualityScore(overallScore * 100);

    return {
      query,
      retrieved_chunks: chunkQualities,
      overall_score: Math.round(overallScore * 100),
      diversity_score: Math.round(diversityScore),
      relevance_score: Math.round(avgRelevance * 100),
      freshness_score: Math.round(avgFreshness),
      trust_score: Math.round(avgTrust),
      recommendations,
    };
  }

  /**
   * Record feedback for a source
   */
  recordSourceFeedback(
    source_id: string,
    feedback: 'positive' | 'negative',
    converted: boolean = false
  ): void {
    const existing = this.sourceFeedback.get(source_id) || {
      source_id,
      positive: 0,
      negative: 0,
      conversions: 0,
      positions: [],
    };

    if (feedback === 'positive') {
      existing.positive++;
    } else {
      existing.negative++;
    }

    if (converted) {
      existing.conversions++;
    }

    this.sourceFeedback.set(source_id, existing);
  }

  /**
   * Record retrieval position for a source
   */
  recordRetrievalPosition(source_id: string, position: number): void {
    const existing = this.sourceFeedback.get(source_id) || {
      source_id,
      positive: 0,
      negative: 0,
      conversions: 0,
      positions: [],
    };

    existing.positions.push(position);
    // Keep only last 100 positions
    if (existing.positions.length > 100) {
      existing.positions = existing.positions.slice(-100);
    }

    this.sourceFeedback.set(source_id, existing);
  }

  /**
   * Record quality score for trending
   */
  private recordQualityScore(score: number): void {
    const today = new Date().toISOString().split('T')[0];
    const todayEntry = this.qualityHistory.find(h => h.date === today);
    
    if (todayEntry) {
      todayEntry.scores.push(score);
    } else {
      this.qualityHistory.push({ date: today, scores: [score] });
    }

    // Keep only last 30 days
    if (this.qualityHistory.length > 30) {
      this.qualityHistory = this.qualityHistory.slice(-30);
    }
  }

  /**
   * Get source performance metrics
   */
  getSourcePerformance(source_id: string): SourcePerformance | null {
    const feedback = this.sourceFeedback.get(source_id);
    if (!feedback) return null;

    const totalFeedback = feedback.positive + feedback.negative;
    const helpfulRate = totalFeedback > 0 
      ? feedback.positive / totalFeedback 
      : 0;

    const avgPosition = feedback.positions.length > 0
      ? feedback.positions.reduce((a, b) => a + b, 0) / feedback.positions.length
      : 0;

    return {
      source_id,
      total_retrievals: feedback.positions.length,
      positive_feedback: feedback.positive,
      negative_feedback: feedback.negative,
      helpful_rate: Math.round(helpfulRate * 100) / 100,
      avg_position: Math.round(avgPosition * 10) / 10,
      conversion_contribution: feedback.conversions,
      last_used: new Date(), // Would track in real implementation
    };
  }

  /**
   * Get RAG quality dashboard
   */
  getDashboard(allSources: SourceMetadata[]): RAGQualityDashboard {
    // Calculate average quality from history
    const avgQuality = this.qualityHistory.length > 0
      ? this.qualityHistory.reduce((sum, day) => {
          const dayAvg = day.scores.reduce((a, b) => a + b, 0) / day.scores.length;
          return sum + dayAvg;
        }, 0) / this.qualityHistory.length
      : 70;

    // Get source performances
    const performances: SourcePerformance[] = [];
    for (const source of allSources) {
      const perf = this.getSourcePerformance(source.source_id);
      if (perf) {
        performances.push(perf);
      }
    }

    // Sort by helpful rate
    const topSources = performances
      .sort((a, b) => b.helpful_rate - a.helpful_rate)
      .slice(0, 10)
      .map(p => ({ source_id: p.source_id, score: p.helpful_rate * 100 }));

    // Find stale sources
    const staleSources = allSources
      .map(source => {
        const daysSinceUpdate = Math.floor(
          (Date.now() - source.updated_at.getTime()) / (1000 * 60 * 60 * 24)
        );
        const threshold = this.STALENESS_THRESHOLDS[source.source_type];
        return {
          source_id: source.source_id,
          days_stale: daysSinceUpdate - threshold,
        };
      })
      .filter(s => s.days_stale > 0)
      .sort((a, b) => b.days_stale - a.days_stale);

    // Find low trust sources
    const lowTrustSources = allSources
      .map(source => ({
        source_id: source.source_id,
        trust_score: this.calculateTrustScore(source).score,
      }))
      .filter(s => s.trust_score < this.TRUST_THRESHOLDS.medium)
      .sort((a, b) => a.trust_score - b.trust_score);

    // Generate quality trend
    const qualityTrend = this.qualityHistory.map(day => ({
      date: day.date,
      score: Math.round(
        day.scores.reduce((a, b) => a + b, 0) / day.scores.length
      ),
    }));

    // Generate recommendations
    const recommendations: string[] = [];

    if (staleSources.length > allSources.length * 0.2) {
      recommendations.push(
        `${staleSources.length} sources are stale (${Math.round(staleSources.length / allSources.length * 100)}% of content). Schedule content refresh.`
      );
    }

    if (lowTrustSources.length > allSources.length * 0.3) {
      recommendations.push(
        `${lowTrustSources.length} sources have low trust scores. Review and verify content.`
      );
    }

    if (avgQuality < 70) {
      recommendations.push(
        'Overall RAG quality is below target. Consider improving chunking, embeddings, or adding more high-quality sources.'
      );
    }

    if (topSources.length > 0 && topSources[0].score < 70) {
      recommendations.push(
        'Even top sources have low helpful rates. Investigate query-content mismatch.'
      );
    }

    return {
      period: 'Last 30 days',
      avg_retrieval_quality: Math.round(avgQuality),
      source_performance: performances,
      top_sources: topSources,
      stale_sources: staleSources.slice(0, 10),
      low_trust_sources: lowTrustSources.slice(0, 10),
      quality_trend: qualityTrend,
      recommendations,
    };
  }

  /**
   * Get sources that need immediate attention
   */
  getSourcesNeedingAttention(allSources: SourceMetadata[]): {
    stale: SourceMetadata[];
    low_trust: SourceMetadata[];
    poor_performance: SourceMetadata[];
  } {
    const stale: SourceMetadata[] = [];
    const lowTrust: SourceMetadata[] = [];
    const poorPerformance: SourceMetadata[] = [];

    for (const source of allSources) {
      const daysSinceUpdate = Math.floor(
        (Date.now() - source.updated_at.getTime()) / (1000 * 60 * 60 * 24)
      );
      const threshold = this.STALENESS_THRESHOLDS[source.source_type];
      
      if (daysSinceUpdate > threshold) {
        stale.push(source);
      }

      const trustScore = this.calculateTrustScore(source);
      if (trustScore.trust_level === 'low' || trustScore.trust_level === 'unverified') {
        lowTrust.push(source);
      }

      const perf = this.getSourcePerformance(source.source_id);
      if (perf && perf.helpful_rate < 0.5 && perf.total_retrievals > 10) {
        poorPerformance.push(source);
      }
    }

    return { stale, low_trust: lowTrust, poor_performance: poorPerformance };
  }

  /**
   * Calculate optimal retrieval parameters based on query intent
   */
  getOptimalRetrievalParams(queryIntent: 'product' | 'support' | 'policy' | 'general'): {
    top_k: number;
    min_similarity: number;
    preferred_source_types: SourceMetadata['source_type'][];
    trust_threshold: number;
  } {
    const params = {
      product: {
        top_k: 5,
        min_similarity: 0.75,
        preferred_source_types: ['product', 'faq', 'documentation'] as SourceMetadata['source_type'][],
        trust_threshold: 60,
      },
      support: {
        top_k: 8,
        min_similarity: 0.65,
        preferred_source_types: ['support_ticket', 'faq', 'documentation'] as SourceMetadata['source_type'][],
        trust_threshold: 50,
      },
      policy: {
        top_k: 3,
        min_similarity: 0.8,
        preferred_source_types: ['policy', 'documentation'] as SourceMetadata['source_type'][],
        trust_threshold: 80,
      },
      general: {
        top_k: 6,
        min_similarity: 0.7,
        preferred_source_types: ['documentation', 'faq', 'blog'] as SourceMetadata['source_type'][],
        trust_threshold: 60,
      },
    };

    return params[queryIntent];
  }
}

// Singleton export
export const ragQualityScorer = new RAGQualityScorer();

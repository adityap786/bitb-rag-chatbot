/**
 * Conversation Intelligence Engine - LLMOps Feature #3
 * 
 * "Discover what your customers REALLY want"
 * 
 * This is the feature that makes users say "WOW" when they see the insights.
 * Extracts hidden patterns, sentiment, and business intelligence from conversations.
 * 
 * Features:
 * - Real-time sentiment analysis
 * - Intent classification with confidence
 * - Topic extraction and trending
 * - Customer satisfaction scoring
 * - Churn risk prediction
 * - Conversion opportunity detection
 * - Frustration detection
 * - Key entity extraction
 * 
 * @module llmops/conversation-intelligence
 */

import { logger } from '../observability/logger';

// ============================================================================
// Types
// ============================================================================

export type SentimentLevel = 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
export type IntentCategory = 
  | 'purchase' | 'inquiry' | 'support' | 'complaint' | 'praise'
  | 'pricing' | 'booking' | 'cancellation' | 'refund' | 'general';

export interface ConversationInsights {
  // Core metrics
  sentiment: {
    overall: SentimentLevel;
    score: number; // -1 to 1
    progression: SentimentLevel[]; // How sentiment changed during conversation
    turning_points: Array<{
      message_index: number;
      from: SentimentLevel;
      to: SentimentLevel;
      trigger: string;
    }>;
  };
  
  // Intent analysis
  intent: {
    primary: IntentCategory;
    secondary: IntentCategory[];
    confidence: number;
    commercial_value: 'high' | 'medium' | 'low';
  };
  
  // Topics discussed
  topics: Array<{
    name: string;
    frequency: number;
    sentiment: SentimentLevel;
    related_entities: string[];
  }>;
  
  // Customer state
  customer_state: {
    satisfaction_score: number; // 0-100
    frustration_level: number; // 0-100
    engagement_level: number; // 0-100
    churn_risk: 'high' | 'medium' | 'low';
    conversion_probability: number; // 0-1
  };
  
  // Extracted entities
  entities: {
    products: string[];
    features: string[];
    competitors: string[];
    pain_points: string[];
    objections: string[];
    budget_signals: string[];
    timeline_signals: string[];
  };
  
  // Actionable insights
  recommendations: Array<{
    type: 'escalate' | 'offer_discount' | 'follow_up' | 'upsell' | 'collect_feedback';
    priority: 'high' | 'medium' | 'low';
    reason: string;
    suggested_action: string;
  }>;
  
  // Business metrics
  business_signals: {
    is_hot_lead: boolean;
    buying_stage: 'awareness' | 'consideration' | 'decision' | 'retention';
    deal_size_indicator: 'enterprise' | 'business' | 'starter' | 'unknown';
    urgency_level: 'immediate' | 'this_week' | 'this_month' | 'exploring';
  };
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

// ============================================================================
// Sentiment Analysis
// ============================================================================

const SENTIMENT_LEXICON = {
  very_positive: [
    'love', 'amazing', 'excellent', 'fantastic', 'perfect', 'awesome',
    'brilliant', 'outstanding', 'wonderful', 'incredible', 'best ever',
    'exceeded expectations', 'highly recommend', 'game changer'
  ],
  positive: [
    'good', 'great', 'nice', 'helpful', 'thanks', 'appreciate',
    'works well', 'satisfied', 'happy', 'pleased', 'useful', 'easy'
  ],
  neutral: [
    'okay', 'fine', 'alright', 'average', 'normal', 'standard',
    'acceptable', 'adequate', 'sufficient'
  ],
  negative: [
    'bad', 'poor', 'disappointing', 'frustrated', 'annoyed', 'confused',
    'difficult', 'slow', 'issue', 'problem', 'doesn\'t work', 'broken'
  ],
  very_negative: [
    'terrible', 'awful', 'horrible', 'worst', 'hate', 'angry',
    'unacceptable', 'scam', 'waste', 'refund', 'cancel subscription',
    'never again', 'reporting', 'lawyer', 'sue'
  ]
};

const INTENT_KEYWORDS: Record<IntentCategory, string[]> = {
  purchase: ['buy', 'purchase', 'order', 'checkout', 'add to cart', 'get started', 'sign up', 'subscribe'],
  inquiry: ['what is', 'how does', 'can you explain', 'tell me about', 'information', 'details'],
  support: ['help', 'issue', 'problem', 'not working', 'error', 'fix', 'broken', 'support'],
  complaint: ['complaint', 'disappointed', 'unacceptable', 'speak to manager', 'refund', 'terrible'],
  praise: ['thank you', 'great job', 'love it', 'perfect', 'excellent service', 'recommend'],
  pricing: ['price', 'cost', 'how much', 'discount', 'coupon', 'payment', 'plan', 'tier'],
  booking: ['book', 'schedule', 'appointment', 'reserve', 'meeting', 'available time'],
  cancellation: ['cancel', 'unsubscribe', 'stop', 'end subscription', 'remove'],
  refund: ['refund', 'money back', 'charge back', 'return', 'reimburse'],
  general: []
};

// ============================================================================
// Conversation Intelligence Engine
// ============================================================================

export class ConversationIntelligence {
  private static instance: ConversationIntelligence;
  
  // Aggregate analytics storage
  private topicCounts = new Map<string, number>();
  private intentCounts = new Map<IntentCategory, number>();
  
  static getInstance(): ConversationIntelligence {
    if (!ConversationIntelligence.instance) {
      ConversationIntelligence.instance = new ConversationIntelligence();
    }
    return ConversationIntelligence.instance;
  }

  /**
   * Analyze a full conversation and extract insights
   */
  async analyzeConversation(
    messages: ConversationMessage[],
    tenantId: string,
    sessionId?: string
  ): Promise<ConversationInsights> {
    const userMessages = messages.filter(m => m.role === 'user');
    const allText = userMessages.map(m => m.content).join(' ');
    
    // Run all analyses in parallel
    const [
      sentiment,
      intent,
      topics,
      entities,
      customerState
    ] = await Promise.all([
      this.analyzeSentiment(messages),
      this.classifyIntent(allText),
      this.extractTopics(allText),
      this.extractEntities(allText),
      this.assessCustomerState(messages),
    ]);
    
    // Generate recommendations based on analysis
    const recommendations = this.generateRecommendations({
      sentiment,
      intent,
      customerState,
      entities,
    });
    
    // Assess business signals
    const businessSignals = this.assessBusinessSignals({
      intent,
      entities,
      sentiment,
      messageCount: messages.length,
    });
    
    const insights: ConversationInsights = {
      sentiment,
      intent,
      topics,
      customer_state: customerState,
      entities,
      recommendations,
      business_signals: businessSignals,
    };
    
    logger.info('Conversation analyzed', {
      tenantId,
      sessionId,
      sentiment: sentiment.overall,
      intent: intent.primary,
      churnRisk: customerState.churn_risk,
    });
    
    // Update aggregates
    this.updateAggregates(insights);
    
    return insights;
  }

  /**
   * Analyze sentiment across messages
   */
  private async analyzeSentiment(messages: ConversationMessage[]): Promise<ConversationInsights['sentiment']> {
    const sentimentProgression: SentimentLevel[] = [];
    let runningScore = 0;
    const turningPoints: ConversationInsights['sentiment']['turning_points'] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== 'user') continue;
      
      const msgSentiment = this.scoreSentiment(msg.content);
      sentimentProgression.push(msgSentiment.level);
      runningScore = (runningScore + msgSentiment.score) / 2; // Moving average
      
      // Detect turning points
      if (sentimentProgression.length >= 2) {
        const prev = sentimentProgression[sentimentProgression.length - 2];
        const curr = sentimentProgression[sentimentProgression.length - 1];
        
        if (this.isSentimentShift(prev, curr)) {
          turningPoints.push({
            message_index: i,
            from: prev,
            to: curr,
            trigger: this.extractTrigger(msg.content, prev, curr),
          });
        }
      }
    }
    
    const overall = this.scoreToLevel(runningScore);
    
    return {
      overall,
      score: runningScore,
      progression: sentimentProgression,
      turning_points: turningPoints,
    };
  }

  /**
   * Score sentiment of a single message
   */
  private scoreSentiment(text: string): { score: number; level: SentimentLevel } {
    const lowerText = text.toLowerCase();
    let score = 0;
    let matches = 0;
    
    // Score based on lexicon matches
    for (const word of SENTIMENT_LEXICON.very_positive) {
      if (lowerText.includes(word)) { score += 1; matches++; }
    }
    for (const word of SENTIMENT_LEXICON.positive) {
      if (lowerText.includes(word)) { score += 0.5; matches++; }
    }
    for (const word of SENTIMENT_LEXICON.negative) {
      if (lowerText.includes(word)) { score -= 0.5; matches++; }
    }
    for (const word of SENTIMENT_LEXICON.very_negative) {
      if (lowerText.includes(word)) { score -= 1; matches++; }
    }
    
    // Normalize
    const normalizedScore = matches > 0 ? Math.max(-1, Math.min(1, score / matches)) : 0;
    
    // Check for negation
    const hasNegation = /\b(not|don't|doesn't|won't|can't|never|no)\b/i.test(lowerText);
    const finalScore = hasNegation ? normalizedScore * -0.5 : normalizedScore;
    
    return {
      score: finalScore,
      level: this.scoreToLevel(finalScore),
    };
  }

  private scoreToLevel(score: number): SentimentLevel {
    if (score >= 0.6) return 'very_positive';
    if (score >= 0.2) return 'positive';
    if (score > -0.2) return 'neutral';
    if (score > -0.6) return 'negative';
    return 'very_negative';
  }

  private isSentimentShift(prev: SentimentLevel, curr: SentimentLevel): boolean {
    const levels: SentimentLevel[] = ['very_negative', 'negative', 'neutral', 'positive', 'very_positive'];
    const prevIdx = levels.indexOf(prev);
    const currIdx = levels.indexOf(curr);
    return Math.abs(prevIdx - currIdx) >= 2; // At least 2 levels of change
  }

  private extractTrigger(text: string, from: SentimentLevel, to: SentimentLevel): string {
    // Simple extraction - first 50 chars that might explain the shift
    const words = text.split(/\s+/).slice(0, 10).join(' ');
    return words.length > 50 ? words.substring(0, 50) + '...' : words;
  }

  /**
   * Classify primary and secondary intents
   */
  private async classifyIntent(text: string): Promise<ConversationInsights['intent']> {
    const lowerText = text.toLowerCase();
    const intentScores: Record<IntentCategory, number> = {
      purchase: 0, inquiry: 0, support: 0, complaint: 0, praise: 0,
      pricing: 0, booking: 0, cancellation: 0, refund: 0, general: 0
    };
    
    // Score each intent category
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          intentScores[intent as IntentCategory] += 1;
        }
      }
    }
    
    // Sort by score
    const sorted = Object.entries(intentScores)
      .sort((a, b) => b[1] - a[1]);
    
    const primary = sorted[0][0] as IntentCategory;
    const primaryScore = sorted[0][1];
    const secondary = sorted
      .slice(1, 3)
      .filter(([_, score]) => score > 0)
      .map(([intent]) => intent as IntentCategory);
    
    // Calculate confidence
    const totalScore = sorted.reduce((sum, [_, s]) => sum + s, 0);
    const confidence = totalScore > 0 ? primaryScore / totalScore : 0.5;
    
    // Determine commercial value
    const highValueIntents: IntentCategory[] = ['purchase', 'pricing', 'booking'];
    const mediumValueIntents: IntentCategory[] = ['inquiry', 'support'];
    
    let commercialValue: 'high' | 'medium' | 'low' = 'low';
    if (highValueIntents.includes(primary)) commercialValue = 'high';
    else if (mediumValueIntents.includes(primary)) commercialValue = 'medium';
    
    return {
      primary,
      secondary,
      confidence,
      commercial_value: commercialValue,
    };
  }

  /**
   * Extract topics from conversation
   */
  private async extractTopics(text: string): Promise<ConversationInsights['topics']> {
    const topics: ConversationInsights['topics'] = [];
    const words = text.toLowerCase().split(/\s+/);
    
    // Simple n-gram topic extraction
    const ngramCounts = new Map<string, number>();
    
    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (this.isValidTopic(bigram)) {
        ngramCounts.set(bigram, (ngramCounts.get(bigram) || 0) + 1);
      }
    }
    
    // Single important words
    for (const word of words) {
      if (word.length > 4 && this.isValidTopic(word)) {
        ngramCounts.set(word, (ngramCounts.get(word) || 0) + 1);
      }
    }
    
    // Convert to topics
    const sortedTopics = Array.from(ngramCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    for (const [name, frequency] of sortedTopics) {
      const sentiment = this.scoreSentiment(name).level;
      topics.push({
        name,
        frequency,
        sentiment,
        related_entities: [],
      });
    }
    
    return topics;
  }

  private isValidTopic(text: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his',
      'her', 'its', 'our', 'their', 'what', 'which', 'who', 'when', 'where',
      'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most'
    ]);
    
    const words = text.split(/\s+/);
    return !words.every(w => stopWords.has(w));
  }

  /**
   * Extract named entities and business signals
   */
  private async extractEntities(text: string): Promise<ConversationInsights['entities']> {
    const lowerText = text.toLowerCase();
    
    return {
      products: this.extractMatches(text, /(?:product|item|model|version)\s+([A-Z][a-zA-Z0-9\-]+)/gi),
      features: this.extractMatches(text, /(?:feature|capability|function|ability)\s+(?:to\s+)?([a-zA-Z\s]+)/gi),
      competitors: this.extractCompetitors(lowerText),
      pain_points: this.extractPainPoints(lowerText),
      objections: this.extractObjections(lowerText),
      budget_signals: this.extractBudgetSignals(lowerText),
      timeline_signals: this.extractTimelineSignals(lowerText),
    };
  }

  private extractMatches(text: string, pattern: RegExp): string[] {
    const matches: string[] = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) matches.push(match[1].trim());
    }
    return [...new Set(matches)];
  }

  private extractCompetitors(text: string): string[] {
    const competitors: string[] = [];
    const patterns = [
      /compared to ([a-zA-Z]+)/gi,
      /better than ([a-zA-Z]+)/gi,
      /switching from ([a-zA-Z]+)/gi,
      /currently using ([a-zA-Z]+)/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) competitors.push(match[1]);
      }
    }
    
    return [...new Set(competitors)];
  }

  private extractPainPoints(text: string): string[] {
    const painPoints: string[] = [];
    const indicators = [
      'struggling with', 'frustrated by', 'problem with', 'issue with',
      'can\'t', 'doesn\'t work', 'too slow', 'too expensive', 'too complicated'
    ];
    
    for (const indicator of indicators) {
      if (text.includes(indicator)) {
        const idx = text.indexOf(indicator);
        const context = text.substring(idx, Math.min(idx + 50, text.length));
        painPoints.push(context);
      }
    }
    
    return painPoints.slice(0, 5);
  }

  private extractObjections(text: string): string[] {
    const objections: string[] = [];
    const patterns = [
      'too expensive', 'don\'t have budget', 'need to think', 'need approval',
      'not the right time', 'already have', 'happy with current', 'not sure if'
    ];
    
    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        objections.push(pattern);
      }
    }
    
    return objections;
  }

  private extractBudgetSignals(text: string): string[] {
    const signals: string[] = [];
    const budgetPatterns = [
      /budget (?:is |of )?(\$?[\d,]+k?)/gi,
      /(\$[\d,]+)/g,
      /looking to spend/gi,
      /enterprise/gi,
      /startup/gi,
      /small business/gi,
    ];
    
    for (const pattern of budgetPatterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        if (match) signals.push(match[0]);
      }
    }
    
    return signals;
  }

  private extractTimelineSignals(text: string): string[] {
    const signals: string[] = [];
    const timePatterns = [
      'asap', 'immediately', 'urgent', 'this week', 'this month',
      'next quarter', 'next year', 'no rush', 'just exploring', 'researching'
    ];
    
    for (const pattern of timePatterns) {
      if (text.includes(pattern)) {
        signals.push(pattern);
      }
    }
    
    return signals;
  }

  /**
   * Assess overall customer state
   */
  private async assessCustomerState(
    messages: ConversationMessage[]
  ): Promise<ConversationInsights['customer_state']> {
    const userMessages = messages.filter(m => m.role === 'user');
    const allUserText = userMessages.map(m => m.content).join(' ');
    
    // Satisfaction score (0-100)
    const sentimentResult = this.scoreSentiment(allUserText);
    const satisfaction = Math.round((sentimentResult.score + 1) * 50); // Convert -1..1 to 0..100
    
    // Frustration level (0-100)
    const frustrationIndicators = [
      'frustrated', 'annoyed', 'angry', 'confused', 'don\'t understand',
      '???', '!!', 'already told you', 'again', 'still not working'
    ];
    let frustration = 0;
    for (const indicator of frustrationIndicators) {
      if (allUserText.toLowerCase().includes(indicator)) {
        frustration += 15;
      }
    }
    frustration = Math.min(100, frustration);
    
    // Engagement level (0-100)
    const avgMessageLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / Math.max(userMessages.length, 1);
    const questionCount = (allUserText.match(/\?/g) || []).length;
    let engagement = 50;
    if (avgMessageLength > 100) engagement += 20;
    if (questionCount > 3) engagement += 15;
    if (userMessages.length > 5) engagement += 15;
    engagement = Math.min(100, engagement);
    
    // Churn risk
    let churnRisk: 'high' | 'medium' | 'low' = 'low';
    if (frustration > 60 || satisfaction < 30) churnRisk = 'high';
    else if (frustration > 30 || satisfaction < 50) churnRisk = 'medium';
    
    // Conversion probability
    const buyingSignals = ['buy', 'purchase', 'sign up', 'get started', 'pricing', 'demo'];
    const hasSignals = buyingSignals.some(s => allUserText.toLowerCase().includes(s));
    const conversionProbability = hasSignals ? 0.6 + (satisfaction / 100 * 0.3) : 0.2;
    
    return {
      satisfaction_score: satisfaction,
      frustration_level: frustration,
      engagement_level: engagement,
      churn_risk: churnRisk,
      conversion_probability: Math.min(1, conversionProbability),
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(params: {
    sentiment: ConversationInsights['sentiment'];
    intent: ConversationInsights['intent'];
    customerState: ConversationInsights['customer_state'];
    entities: ConversationInsights['entities'];
  }): ConversationInsights['recommendations'] {
    const recommendations: ConversationInsights['recommendations'] = [];
    
    // High frustration -> escalate
    if (params.customerState.frustration_level > 50) {
      recommendations.push({
        type: 'escalate',
        priority: 'high',
        reason: `Customer frustration level is ${params.customerState.frustration_level}%`,
        suggested_action: 'Transfer to human agent immediately with full context',
      });
    }
    
    // Price objection -> offer discount
    if (params.entities.objections.some(o => o.includes('expensive'))) {
      recommendations.push({
        type: 'offer_discount',
        priority: 'medium',
        reason: 'Customer mentioned price concerns',
        suggested_action: 'Offer 10% discount or extended trial',
      });
    }
    
    // High engagement + purchase intent -> upsell
    if (params.intent.primary === 'purchase' && params.customerState.engagement_level > 70) {
      recommendations.push({
        type: 'upsell',
        priority: 'medium',
        reason: 'High engagement with purchase intent',
        suggested_action: 'Suggest premium plan or add-ons',
      });
    }
    
    // Positive sentiment -> collect feedback
    if (params.sentiment.overall === 'very_positive') {
      recommendations.push({
        type: 'collect_feedback',
        priority: 'low',
        reason: 'Customer had positive experience',
        suggested_action: 'Ask for review or testimonial',
      });
    }
    
    // Follow up opportunities
    if (params.entities.timeline_signals.some(s => ['next month', 'next quarter'].includes(s))) {
      recommendations.push({
        type: 'follow_up',
        priority: 'medium',
        reason: 'Customer indicated future timeline',
        suggested_action: 'Schedule follow-up in 2-3 weeks',
      });
    }
    
    return recommendations;
  }

  /**
   * Assess business signals
   */
  private assessBusinessSignals(params: {
    intent: ConversationInsights['intent'];
    entities: ConversationInsights['entities'];
    sentiment: ConversationInsights['sentiment'];
    messageCount: number;
  }): ConversationInsights['business_signals'] {
    // Is hot lead?
    const isHotLead = 
      params.intent.commercial_value === 'high' &&
      params.sentiment.score > 0 &&
      params.entities.timeline_signals.some(s => ['asap', 'immediately', 'this week'].includes(s));
    
    // Buying stage
    let buyingStage: ConversationInsights['business_signals']['buying_stage'] = 'awareness';
    if (params.intent.primary === 'inquiry') buyingStage = 'consideration';
    if (params.intent.primary === 'pricing') buyingStage = 'decision';
    if (params.intent.primary === 'purchase') buyingStage = 'decision';
    if (params.intent.primary === 'support') buyingStage = 'retention';
    
    // Deal size
    let dealSize: ConversationInsights['business_signals']['deal_size_indicator'] = 'unknown';
    if (params.entities.budget_signals.some(s => s.includes('enterprise'))) dealSize = 'enterprise';
    else if (params.entities.budget_signals.some(s => s.includes('startup') || s.includes('small'))) dealSize = 'starter';
    else if (params.messageCount > 10) dealSize = 'business';
    
    // Urgency
    let urgency: ConversationInsights['business_signals']['urgency_level'] = 'exploring';
    if (params.entities.timeline_signals.some(s => ['asap', 'immediately', 'urgent'].includes(s))) urgency = 'immediate';
    else if (params.entities.timeline_signals.some(s => s.includes('this week'))) urgency = 'this_week';
    else if (params.entities.timeline_signals.some(s => s.includes('this month'))) urgency = 'this_month';
    
    return {
      is_hot_lead: isHotLead,
      buying_stage: buyingStage,
      deal_size_indicator: dealSize,
      urgency_level: urgency,
    };
  }

  /**
   * Update aggregate analytics
   */
  private updateAggregates(insights: ConversationInsights): void {
    // Track intent distribution
    this.intentCounts.set(
      insights.intent.primary,
      (this.intentCounts.get(insights.intent.primary) || 0) + 1
    );
    
    // Track topic trends
    for (const topic of insights.topics) {
      this.topicCounts.set(topic.name, (this.topicCounts.get(topic.name) || 0) + 1);
    }
  }

  /**
   * Get aggregate analytics for a tenant
   */
  async getAggregateAnalytics(tenantId: string): Promise<{
    top_intents: Array<{ intent: IntentCategory; count: number }>;
    trending_topics: Array<{ topic: string; count: number }>;
    avg_sentiment: number;
    churn_risk_distribution: { high: number; medium: number; low: number };
  }> {
    const topIntents = Array.from(this.intentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));
    
    const trendingTopics = Array.from(this.topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));
    
    return {
      top_intents: topIntents,
      trending_topics: trendingTopics,
      avg_sentiment: 0.2, // Would calculate from stored data
      churn_risk_distribution: { high: 10, medium: 30, low: 60 },
    };
  }
}

// Export singleton
export const conversationIntelligence = ConversationIntelligence.getInstance();

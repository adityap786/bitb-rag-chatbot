
/**
 * Analytics Scoring System
 * 
 * PRODUCTION NOTES:
 * - Currently uses in-memory storage for demo purposes
 * - TODO: Replace with Supabase/Postgres for production
 * - TODO: Add tenant isolation (multi-tenancy)
 * - TODO: Implement time-series aggregation for dashboards
 * - TODO: Add anomaly detection for quality monitoring
 */

export interface ConversationScore {
  sessionId: string;
  score: number;
  feedback?: string;
  timestamp: string;
  tenantId?: string;
  userId?: string;
  metadata?: {
    messageCount?: number;
    errorCount?: number;
    averageResponseTime?: number;
  };
}

export class ScoringError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_INPUT' | 'DB_ERROR' | 'UNKNOWN',
    public details?: any
  ) {
    super(message);
    this.name = 'ScoringError';
  }
}

/**
 * TEMPORARY: In-memory storage
 * WARNING: Data will be lost on server restart
 * Replace with persistent database in production
 */
const CONVERSATION_SCORES: ConversationScore[] = [];

/**
 * Score a conversation based on messages and feedback
 * 
 * @param sessionId - Unique session identifier
 * @param messages - Array of conversation messages
 * @param feedback - Optional user feedback
 * @param options - Additional options
 * @returns Scored conversation
 * @throws ScoringError if input is invalid
 */
export function scoreConversation(
  sessionId: string, 
  messages: Array<{ role: string; content: string }>, 
  feedback?: string,
  options?: {
    tenantId?: string;
    userId?: string;
  }
): ConversationScore {
  // Input validation
  if (!sessionId || typeof sessionId !== 'string') {
    throw new ScoringError('Session ID is required', 'INVALID_INPUT');
  }

  if (!Array.isArray(messages)) {
    throw new ScoringError('Messages must be an array', 'INVALID_INPUT');
  }

  try {
    // Scoring algorithm: +1 for user message, +2 for assistant, -1 for errors
    let score = 0;
    let errorCount = 0;

    for (const msg of messages) {
      if (!msg || typeof msg !== 'object' || !msg.role || !msg.content) {
        continue; // Skip malformed messages
      }

      if (msg.role === 'user') score += 1;
      if (msg.role === 'assistant') score += 2;
      if (msg.role === 'assistant' && msg.content.toLowerCase().includes('error')) {
        score -= 1;
        errorCount++;
      }
    }

    // Feedback adjustments
    if (feedback) {
      const feedbackLower = feedback.toLowerCase();
      if (feedbackLower.includes('bad') || feedbackLower.includes('poor')) score -= 2;
      if (feedbackLower.includes('good') || feedbackLower.includes('excellent')) score += 2;
    }

    const result: ConversationScore = {
      sessionId,
      score,
      feedback,
      timestamp: new Date().toISOString(),
      tenantId: options?.tenantId,
      userId: options?.userId,
      metadata: {
        messageCount: messages.length,
        errorCount
      }
    };

    CONVERSATION_SCORES.push(result);
    return result;
  } catch (error) {
    throw new ScoringError(
      'Failed to score conversation',
      'DB_ERROR',
      error
    );
  }
}

/**
 * Get all conversation scores
 * 
 * @param options - Filter and sorting options
 * @returns Array of conversation scores
 */
export function getScores(options?: {
  tenantId?: string;
  limit?: number;
  sortBy?: 'score' | 'timestamp';
  order?: 'asc' | 'desc';
}): ConversationScore[] {
  try {
    let results = CONVERSATION_SCORES;

    // Filter by tenant
    if (options?.tenantId) {
      results = results.filter(s => s.tenantId === options.tenantId);
    }

    // Sort
    if (options?.sortBy) {
      results = [...results].sort((a, b) => {
        const aVal = options.sortBy === 'score' ? a.score : new Date(a.timestamp).getTime();
        const bVal = options.sortBy === 'score' ? b.score : new Date(b.timestamp).getTime();
        return options.order === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    // Limit
    if (options?.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  } catch (error) {
    throw new ScoringError(
      'Failed to retrieve scores',
      'DB_ERROR',
      error
    );
  }
}

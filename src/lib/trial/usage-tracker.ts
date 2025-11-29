import type { UsageEventPayload } from '../../types/trial';
import { createLazyServiceClient } from '../supabase-client';

const supabase = createLazyServiceClient();

export interface UsageTrackingContext {
  tenantId: string;
  startTime: number;
  eventType: UsageEventPayload['event_type'];
  metadata?: Record<string, any>;
}

/**
 * UsageTracker - Records API calls, embeddings, chat messages, and errors in real-time
 *
 * Usage:
 * ```typescript
 * const tracker = new UsageTracker(tenantId, 'chat_message');
 * try {
 *   const response = await processChat(message);
 *   tracker.recordSuccess({
 *     tokens_used: response.tokens,
 *     response_time_ms: response.duration,
 *   });
 * } catch (error) {
 *   tracker.recordFailure(error);
 * }
 * ```
 */
export class UsageTracker {
  private context: UsageTrackingContext;
  private startTime: number;

  constructor(tenantId: string, eventType: UsageEventPayload['event_type'], metadata?: Record<string, any>) {
    this.startTime = Date.now();
    this.context = {
      tenantId,
      startTime: this.startTime,
      eventType,
      metadata,
    };
  }

  /**
   * Record successful operation
   */
  async recordSuccess(details: {
    tokens_used?: number;
    response_time_ms?: number;
    status_code?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const responseTime = details.response_time_ms || Date.now() - this.startTime;
    const tokensUsed = details.tokens_used || 0;
    const costUsd = this.calculateCost(tokensUsed);

    try {
      await supabase.from('tenant_usage_realtime').insert([
        {
          tenant_id: this.context.tenantId,
          event_type: this.context.eventType,
          event_timestamp: new Date().toISOString(),
          api_status_code: details.status_code || 200,
          api_response_time_ms: responseTime,
          tokens_consumed: tokensUsed,
          cost_usd: costUsd,
          ...this.getEventTypeSpecificData(details),
        },
      ]);
    } catch (error) {
      // Log error but don't throw - usage tracking shouldn't fail the main operation
      console.error('Failed to record usage success:', error);
    }
  }

  /**
   * Record failed operation
   */
  async recordFailure(error: Error | unknown, statusCode: number = 500): Promise<void> {
    const responseTime = Date.now() - this.startTime;

    try {
      await supabase.from('tenant_usage_realtime').insert([
        {
          tenant_id: this.context.tenantId,
          event_type: this.context.eventType,
          event_timestamp: new Date().toISOString(),
          api_status_code: statusCode,
          api_response_time_ms: responseTime,
          tokens_consumed: 0,
          cost_usd: 0,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            ...this.context.metadata,
          },
        },
      ]);
    } catch (dbError) {
      console.error('Failed to record usage failure:', dbError);
    }
  }

  /**
   * Record rate limit event
   */
  async recordRateLimit(): Promise<void> {
    const responseTime = Date.now() - this.startTime;

    try {
      await supabase.from('tenant_usage_realtime').insert([
        {
          tenant_id: this.context.tenantId,
          event_type: this.context.eventType,
          event_timestamp: new Date().toISOString(),
          api_status_code: 429,
          api_response_time_ms: responseTime,
          tokens_consumed: 0,
          cost_usd: 0,
          metadata: { rate_limited: true },
        },
      ]);
    } catch (error) {
      console.error('Failed to record rate limit:', error);
    }
  }

  /**
   * Get event-type-specific data to record
   */
  private getEventTypeSpecificData(details: Record<string, any>): Record<string, any> {
    const data: Record<string, any> = {};

    switch (this.context.eventType) {
      case 'chat_message':
        data.api_method = details.is_response ? 'GET' : 'POST';
        data.chat_session_id = this.context.metadata?.session_id;
        break;

      case 'embedding':
        data.embedding_tokens = details.tokens_used || 0;
        break;

      case 'search':
        data.search_query_tokens = details.tokens_used || 0;
        data.search_result_count = this.context.metadata?.result_count || 0;
        break;

      case 'kb_ingest':
        data.api_method = 'POST';
        break;

      case 'api_call':
      default:
        data.api_method = this.context.metadata?.method || 'POST';
        data.api_endpoint = this.context.metadata?.endpoint;
        break;
    }

    return data;
  }

  /**
   * Calculate estimated cost based on tokens (OpenAI pricing model)
   * Embeddings: $0.02 per 1M tokens (text-embedding-ada-002)
   * Completions vary, but using average of $0.01-0.10 depending on model
   */
  private calculateCost(tokens: number): number {
    if (tokens === 0) return 0;

    // Using Ada-002 embedding pricing as baseline
    const costPer1MTokens = 0.02;
    return (tokens / 1_000_000) * costPer1MTokens;
  }
}

/**
 * Create tracker instance - convenience function
 */
export function trackUsage(tenantId: string, eventType: UsageEventPayload['event_type'], metadata?: Record<string, any>) {
  return new UsageTracker(tenantId, eventType, metadata);
}

/**
 * Get tenant usage for a specific period
 */
export async function getTenantUsage(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  periodType: 'hourly' | 'daily' | 'monthly' = 'daily'
) {
  try {
    const { data, error } = await supabase
      .from('tenant_usage_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('period_type', periodType)
      .gte('period_start', periodStart.toISOString())
      .lte('period_end', periodEnd.toISOString())
      .order('period_start', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get tenant usage:', error);
    throw error;
  }
}

/**
 * Get current day's usage for a tenant
 */
export async function getTodayUsage(tenantId: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('tenant_usage_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('period_type', 'daily')
      .gte('period_start', today.toISOString())
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  } catch (error) {
    console.error('Failed to get today usage:', error);
    throw error;
  }
}

/**
 * Get all events for a tenant in a time range (for debugging/audit)
 */
export async function getTenantEvents(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  eventType?: string,
  limit: number = 1000
) {
  try {
    let query = supabase
      .from('tenant_usage_realtime')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('event_timestamp', periodStart.toISOString())
      .lte('event_timestamp', periodEnd.toISOString());

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query.order('event_timestamp', { ascending: false }).limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get tenant events:', error);
    throw error;
  }
}

/**
 * Get aggregated stats for multiple tenants (admin dashboard)
 */
export async function getMultiTenantStats(
  periodType: 'daily' | 'monthly' = 'daily',
  limit: number = 100
) {
  try {
    const { data, error } = await supabase
      .from('tenant_usage_metrics')
      .select('*')
      .eq('period_type', periodType)
      .order('period_start', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Group by tenant
    const grouped = data.reduce(
      (acc, metric) => {
        if (!acc[metric.tenant_id]) {
          acc[metric.tenant_id] = [];
        }
        acc[metric.tenant_id].push(metric);
        return acc;
      },
      {} as Record<string, typeof data>
    );

    return grouped;
  } catch (error) {
    console.error('Failed to get multi-tenant stats:', error);
    throw error;
  }
}

/**
 * Get top consumers (by tokens, by cost, by API calls)
 */
export async function getTopConsumers(
  metric: 'tokens' | 'cost' | 'api_calls',
  periodType: 'daily' | 'monthly' = 'daily',
  limit: number = 10
) {
  try {
    let orderColumn = 'total_tokens_used';

    switch (metric) {
      case 'cost':
        orderColumn = 'estimated_cost_usd';
        break;
      case 'api_calls':
        orderColumn = 'api_calls_total';
        break;
    }

    const { data, error } = await supabase
      .from('tenant_usage_metrics')
      .select('tenant_id, ' + orderColumn)
      .eq('period_type', periodType)
      .order(orderColumn, { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get top consumers:', error);
    throw error;
  }
}

/**
 * Get tenants exceeding quota
 */
export async function getTenantExceedingQuota(periodType: 'daily' | 'monthly' = 'daily') {
  try {
    const { data, error } = await supabase
      .from('tenant_usage_metrics')
      .select('*')
      .eq('period_type', periodType)
      .gt('quota_exceeded_count', 0)
      .order('quota_exceeded_count', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get tenants exceeding quota:', error);
    throw error;
  }
}

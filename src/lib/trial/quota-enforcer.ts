import type { QuotaCheckResult } from '../../types/trial';
import { createLazyServiceClient } from '../supabase-client';

const supabase = createLazyServiceClient();

/**
 * QuotaEnforcer - Prevents tenants from exceeding their token/API limits
 *
 * Usage:
 * ```typescript
 * const allowed = await enforceQuota(tenantId, 'tokens', 500);
 * if (!allowed.allowed) {
 *   return NextResponse.json({ error: 'Quota exceeded' }, { status: 429 });
 * }
 * ```
 */

/**
 * Default quotas for trial tenants (can be customized per plan)
 */
export const DEFAULT_QUOTAS = {
  trial: {
    tokens_per_day: 10_000, // Trial limit: 10k tokens/day
    api_calls_per_minute: 30, // 30 requests/minute
    chat_messages_per_day: 100, // 100 messages/day
    embeddings_per_day: 50, // 50 embedding operations/day
  },
  starter: {
    tokens_per_day: 100_000,
    api_calls_per_minute: 60,
    chat_messages_per_day: 1_000,
    embeddings_per_day: 500,
  },
  pro: {
    tokens_per_day: 500_000,
    api_calls_per_minute: 120,
    chat_messages_per_day: 5_000,
    embeddings_per_day: 2_000,
  },
  enterprise: {
    tokens_per_day: null, // Unlimited
    api_calls_per_minute: null,
    chat_messages_per_day: null,
    embeddings_per_day: null,
  },
};

export type QuotaType = 'tokens' | 'api_calls' | 'chat_messages' | 'embeddings';

/**
 * Check if tenant can consume the requested amount
 */
export async function enforceQuota(
  tenantId: string,
  quotaType: QuotaType,
  amount: number
): Promise<QuotaCheckResult> {
  try {
    // Get tenant's current plan/trial status
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('status, plan, created_at')
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError) {
      return {
        allowed: false,
        tokens_remaining: 0,
        quota_limit: null,
        error: 'Tenant not found',
      };
    }

    // Determine plan type
    let planType: keyof typeof DEFAULT_QUOTAS = 'trial';
    if (tenant.plan === 'starter') planType = 'starter';
    else if (tenant.plan === 'pro') planType = 'pro';
    else if (tenant.plan === 'enterprise') planType = 'enterprise';

    const quotaLimit = getQuotaLimit(planType, quotaType);

    // Unlimited quota
    if (quotaLimit === null) {
      return {
        allowed: true,
        tokens_remaining: -1, // Indicate unlimited
        quota_limit: null,
      };
    }

    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayMetrics, error: metricsError } = await supabase
      .from('tenant_usage_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('period_type', 'daily')
      .gte('period_start', today.toISOString())
      .single();

    if (metricsError && metricsError.code !== 'PGRST116') {
      // PGRST116 = no rows (first request of the day)
      return {
        allowed: false,
        tokens_remaining: 0,
        quota_limit: quotaLimit,
        error: 'Failed to check quota',
      };
    }

    // Get current usage based on quota type
    let currentUsage = 0;
    switch (quotaType) {
      case 'tokens':
        currentUsage = todayMetrics?.total_tokens_used || 0;
        break;
      case 'api_calls':
        currentUsage = todayMetrics?.api_calls_total || 0;
        break;
      case 'chat_messages':
        currentUsage = todayMetrics?.chat_messages_sent || 0;
        break;
      case 'embeddings':
        currentUsage = todayMetrics?.embeddings_generated || 0;
        break;
    }

    const remaining = quotaLimit - currentUsage;
    const allowed = remaining >= amount;

    return {
      allowed,
      tokens_remaining: Math.max(0, remaining),
      quota_limit: quotaLimit,
    };
  } catch (error) {
    console.error('Quota check failed:', error);
    // Fail open by default - don't block requests if quota system fails
    return {
      allowed: true,
      tokens_remaining: -1,
      quota_limit: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get quota limit for a tenant based on plan and quota type
 */
function getQuotaLimit(planType: keyof typeof DEFAULT_QUOTAS, quotaType: QuotaType): number | null {
  const planQuotas = DEFAULT_QUOTAS[planType];

  switch (quotaType) {
    case 'tokens':
      return planQuotas.tokens_per_day;
    case 'api_calls':
      return planQuotas.api_calls_per_minute;
    case 'chat_messages':
      return planQuotas.chat_messages_per_day;
    case 'embeddings':
      return planQuotas.embeddings_per_day;
    default:
      return null;
  }
}

/**
 * Check multiple quota types at once
 */
export async function enforceMultipleQuotas(
  tenantId: string,
  quotas: Array<{ type: QuotaType; amount: number }>
): Promise<{
  allowed: boolean;
  results: Record<QuotaType, QuotaCheckResult>;
}> {
  const results: Record<QuotaType, QuotaCheckResult> = {
    tokens: { allowed: true, tokens_remaining: 0, quota_limit: null },
    api_calls: { allowed: true, tokens_remaining: 0, quota_limit: null },
    chat_messages: { allowed: true, tokens_remaining: 0, quota_limit: null },
    embeddings: { allowed: true, tokens_remaining: 0, quota_limit: null },
  };

  for (const quota of quotas) {
    results[quota.type] = await enforceQuota(tenantId, quota.type, quota.amount);
  }

  const allowed = Object.values(results).every((r) => r.allowed);

  return { allowed, results };
}

/**
 * Set custom quota for a tenant (admin only)
 */
export async function setCustomQuota(
  tenantId: string,
  quotaType: QuotaType,
  limit: number | null
): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get or create today's metric
    const { data: existing, error: fetchError } = await supabase
      .from('tenant_usage_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('period_type', 'daily')
      .gte('period_start', today.toISOString())
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    switch (quotaType) {
      case 'tokens':
        updateData.quota_limit = limit;
        break;
      // Could add other quota types here
    }

    if (existing) {
      // Update existing metric
      await supabase.from('tenant_usage_metrics').update(updateData).eq('metric_id', existing.metric_id);
    } else {
      // Create new metric with custom quota
      await supabase.from('tenant_usage_metrics').insert([
        {
          tenant_id: tenantId,
          period_start: today.toISOString(),
          period_end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          period_type: 'daily',
          quota_limit: quotaType === 'tokens' ? limit : null,
        },
      ]);
    }
  } catch (error) {
    console.error('Failed to set custom quota:', error);
    throw error;
  }
}

/**
 * Get quota status for a tenant
 */
export async function getQuotaStatus(tenantId: string): Promise<{
  plan: string;
  quotas: Record<QuotaType, { limit: number | null; used: number; remaining: number; percentage: number }>;
  anyExceeded: boolean;
}> {
  try {
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('plan, status')
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError) {
      throw tenantError;
    }

    const plan = tenant.plan || 'trial';

    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayMetrics } = await supabase
      .from('tenant_usage_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('period_type', 'daily')
      .gte('period_start', today.toISOString())
      .single();

    const quotas: Record<QuotaType, any> = {
      tokens: { limit: null, used: 0, remaining: 0, percentage: 0 },
      api_calls: { limit: null, used: 0, remaining: 0, percentage: 0 },
      chat_messages: { limit: null, used: 0, remaining: 0, percentage: 0 },
      embeddings: { limit: null, used: 0, remaining: 0, percentage: 0 },
    };

    const planType = (plan === 'trial' || !plan ? 'trial' : plan) as keyof typeof DEFAULT_QUOTAS;

    // Calculate each quota
    quotas.tokens.limit = DEFAULT_QUOTAS[planType].tokens_per_day;
    quotas.tokens.used = todayMetrics?.total_tokens_used || 0;
    quotas.tokens.remaining = quotas.tokens.limit ? quotas.tokens.limit - quotas.tokens.used : -1;
    quotas.tokens.percentage = quotas.tokens.limit ? Math.round((quotas.tokens.used / quotas.tokens.limit) * 100) : 0;

    quotas.api_calls.limit = DEFAULT_QUOTAS[planType].api_calls_per_minute;
    quotas.api_calls.used = todayMetrics?.api_calls_total || 0;
    quotas.api_calls.remaining = quotas.api_calls.limit ? quotas.api_calls.limit - quotas.api_calls.used : -1;
    quotas.api_calls.percentage = quotas.api_calls.limit
      ? Math.round((quotas.api_calls.used / quotas.api_calls.limit) * 100)
      : 0;

    quotas.chat_messages.limit = DEFAULT_QUOTAS[planType].chat_messages_per_day;
    quotas.chat_messages.used = todayMetrics?.chat_messages_sent || 0;
    quotas.chat_messages.remaining = quotas.chat_messages.limit ? quotas.chat_messages.limit - quotas.chat_messages.used : -1;
    quotas.chat_messages.percentage = quotas.chat_messages.limit
      ? Math.round((quotas.chat_messages.used / quotas.chat_messages.limit) * 100)
      : 0;

    quotas.embeddings.limit = DEFAULT_QUOTAS[planType].embeddings_per_day;
    quotas.embeddings.used = todayMetrics?.embeddings_generated || 0;
    quotas.embeddings.remaining = quotas.embeddings.limit ? quotas.embeddings.limit - quotas.embeddings.used : -1;
    quotas.embeddings.percentage = quotas.embeddings.limit
      ? Math.round((quotas.embeddings.used / quotas.embeddings.limit) * 100)
      : 0;

    const anyExceeded = Object.values(quotas).some(
      (q) => q.limit !== null && q.percentage >= 100
    );

    return {
      plan: planType,
      quotas,
      anyExceeded,
    };
  } catch (error) {
    console.error('Failed to get quota status:', error);
    throw error;
  }
}

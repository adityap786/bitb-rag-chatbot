import { NextRequest, NextResponse } from 'next/server';
import { AuthorizationError } from '@/lib/trial/errors';
import TrialLogger from '@/lib/trial/logger';
import {
  getTenantUsage,
  getTodayUsage,
  getTenantEvents,
  getMultiTenantStats,
  getTopConsumers,
  getTenantExceedingQuota,
} from '@/lib/trial/usage-tracker';
import { getQuotaStatus } from '@/lib/trial/quota-enforcer';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { requireAdmin } from '@/lib/auth/admin-middleware';

const supabase = createLazyServiceClient();

// Admin RBAC checks via centralized middleware

/**
 * GET /api/admin/usage - Get usage statistics and dashboard data
 *
 * Query parameters:
 * - tenantId?: Get stats for specific tenant
 * - period?: 'daily' | 'monthly' (default: 'daily')
 * - startDate?: ISO string
 * - endDate?: ISO string
 * - metric?: 'all' | 'tokens' | 'cost' | 'api_calls'
 */
export async function GET(req: any, context: { params: Promise<{}> }) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const { recordApiCall, incrementMetric, observeLatency } = await import('@/lib/monitoring');

  try {
    // Require admin auth (RBAC)
    const adminAuthErr = await requireAdmin(req);
    if (adminAuthErr) return adminAuthErr;
    incrementMetric('admin_usage_requests_total', 'Total admin usage requests', { path: '/api/admin/usage' });

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId') || undefined;
    const period = (searchParams.get('period') || 'daily') as 'daily' | 'monthly';
    const metric = searchParams.get('metric') || 'all';
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    const startDate = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = endDateStr ? new Date(endDateStr) : new Date();

    TrialLogger.info('Usage dashboard request', {
      tenantId,
      period,
      metric,
    });

    // Case 1: Single tenant usage
    if (tenantId) {
      const [usage, quota, events] = await Promise.all([
        getTenantUsage(tenantId, startDate, endDate, period),
        getQuotaStatus(tenantId),
        getTenantEvents(tenantId, startDate, endDate),
      ]);
      observeLatency('admin_usage_latency_ms', Date.now() - startTime, 'Admin usage latency (ms)', { path: '/api/admin/usage' });
      incrementMetric('admin_usage_success_total', 'Total successful admin usage requests', { path: '/api/admin/usage' });
      return NextResponse.json({
        tenantId,
        period,
        usage,
        quota,
        recentEvents: events.slice(0, 50),
        timestamp: new Date().toISOString(),
      });
    }

    // Case 2: Multi-tenant dashboard
    if (metric === 'all' || metric === 'tokens') {
      const topByTokens = await getTopConsumers('tokens', period, 10);
      const multiTenantStats = await getMultiTenantStats(period, 100);
      const exceedingQuota = await getTenantExceedingQuota(period);

      const summary = Object.entries(multiTenantStats).reduce(
        (acc, [, metricsArray]) => {
          const latestMetric = (metricsArray as any[])[0];
          return {
            total_tenants: acc.total_tenants + 1,
            total_api_calls: acc.total_api_calls + (latestMetric?.api_calls_total || 0),
            total_tokens: acc.total_tokens + (latestMetric?.total_tokens_used || 0),
            total_cost: acc.total_cost + (latestMetric?.estimated_cost_usd || 0),
            avg_latency_ms: acc.avg_latency_ms + (latestMetric?.api_latency_avg_ms || 0),
          };
        },
        {
          total_tenants: 0,
          total_api_calls: 0,
          total_tokens: 0,
          total_cost: 0,
          avg_latency_ms: 0,
        }
      );

      // Calculate averages
      if (summary.total_tenants > 0) {
        summary.avg_latency_ms = summary.avg_latency_ms / summary.total_tenants;
      }

      return NextResponse.json({
        period,
        summary,
        topConsumers: topByTokens,
        exceedingQuota,
        timestamp: new Date().toISOString(),
      });
    }

    if (metric === 'cost') {
      const topByCost = await getTopConsumers('cost', period, 10);
      return NextResponse.json({
        period,
        topConsumers: topByCost,
        timestamp: new Date().toISOString(),
      });
    }

    if (metric === 'api_calls') {
      const topByApiCalls = await getTopConsumers('api_calls', period, 10);
      return NextResponse.json({
        period,
        topConsumers: topByApiCalls,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Invalid metric parameter' },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      TrialLogger.warn('Unauthorized usage dashboard access', { requestId });
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    TrialLogger.error(
      'Usage dashboard error',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to retrieve usage data' },
      { status: 500 }
    );
  }
}

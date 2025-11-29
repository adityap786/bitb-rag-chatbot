/**
 * Admin Dashboard API - Overview Statistics and Insights
 * 
 * Endpoints:
 * - GET /api/admin/dashboard - Get dashboard overview
 * - GET /api/admin/dashboard/stats - Get detailed statistics
 * - GET /api/admin/dashboard/alerts - Get system alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-client';
import { logger } from '@/lib/observability/logger';
import { verifyAdminAuth } from '@/lib/admin/auth';
import { redis } from '@/lib/redis-client';

// ============================================================================
// Types
// ============================================================================

interface DashboardOverview {
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    new_this_week: number;
    churn_this_month: number;
  };
  usage: {
    total_queries_today: number;
    total_queries_this_week: number;
    avg_queries_per_tenant: number;
    peak_hour_queries: number;
    total_embeddings: number;
    total_storage_mb: number;
  };
  performance: {
    avg_response_time_ms: number;
    p95_response_time_ms: number;
    error_rate_percent: number;
    uptime_percent: number;
  };
  revenue: {
    mrr: number;
    arr: number;
    new_mrr_this_month: number;
    churned_mrr_this_month: number;
  };
}

interface SystemAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  tenant_id?: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/admin/dashboard
 * Get dashboard overview statistics
 */
export async function GET(req: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    const action = req.nextUrl.searchParams.get('action');

    switch (action) {
      case 'stats':
        return getDetailedStats(req);
      case 'alerts':
        return getSystemAlerts(req);
      default:
        return getDashboardOverview(req);
    }
  } catch (error) {
    logger.error('Dashboard API error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get dashboard overview
 */
async function getDashboardOverview(req: NextRequest): Promise<NextResponse> {
  const db = getServiceClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  // Tenant statistics
  const [
    totalTenants,
    activeTenants,
    trialTenants,
    suspendedTenants,
    newThisWeek,
  ] = await Promise.all([
    db.from('tenants').select('*', { count: 'exact', head: true }),
    db.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('tenants').select('*', { count: 'exact', head: true }).eq('plan', 'trial'),
    db.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'suspended'),
    db.from('tenants').select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString()),
  ]);

  // Usage statistics
  const [todayUsage, weekUsage, totalEmbeddings] = await Promise.all([
    db.from('tenant_usage')
      .select('queries_used')
      .gte('period_start', todayStart.toISOString()),
    db.from('tenant_usage')
      .select('queries_used')
      .gte('period_start', weekAgo.toISOString()),
    db.from('embeddings').select('*', { count: 'exact', head: true }),
  ]);

  const totalQueriesToday = todayUsage.data?.reduce((sum, r) => sum + (r.queries_used || 0), 0) || 0;
  const totalQueriesWeek = weekUsage.data?.reduce((sum, r) => sum + (r.queries_used || 0), 0) || 0;

  // Performance metrics (from Redis if available)
  let avgResponseTime = 0;
  let p95ResponseTime = 0;
  let errorRate = 0;

  if (redis) {
    try {
      const [avgTime, p95Time, errors, total] = await Promise.all([
        redis.get('metrics:avg_response_time'),
        redis.get('metrics:p95_response_time'),
        redis.get('metrics:error_count'),
        redis.get('metrics:request_count'),
      ]);

      avgResponseTime = parseFloat(avgTime || '0');
      p95ResponseTime = parseFloat(p95Time || '0');
      if (total && errors) {
        errorRate = (parseInt(errors) / parseInt(total)) * 100;
      }
    } catch (e) {
      logger.warn('Failed to fetch performance metrics from Redis');
    }
  }

  const overview: DashboardOverview = {
    tenants: {
      total: totalTenants.count || 0,
      active: activeTenants.count || 0,
      trial: trialTenants.count || 0,
      suspended: suspendedTenants.count || 0,
      new_this_week: newThisWeek.count || 0,
      churn_this_month: 0, // Calculate from status changes
    },
    usage: {
      total_queries_today: totalQueriesToday,
      total_queries_this_week: totalQueriesWeek,
      avg_queries_per_tenant: activeTenants.count ? Math.round(totalQueriesToday / activeTenants.count) : 0,
      peak_hour_queries: 0, // Calculate from hourly data
      total_embeddings: totalEmbeddings.count || 0,
      total_storage_mb: 0, // Calculate from storage usage
    },
    performance: {
      avg_response_time_ms: avgResponseTime,
      p95_response_time_ms: p95ResponseTime,
      error_rate_percent: Math.round(errorRate * 100) / 100,
      uptime_percent: 99.9, // Calculate from monitoring
    },
    revenue: {
      mrr: 0, // From billing system
      arr: 0,
      new_mrr_this_month: 0,
      churned_mrr_this_month: 0,
    },
  };

  return NextResponse.json({ overview });
}

/**
 * Get detailed statistics
 */
async function getDetailedStats(req: NextRequest): Promise<NextResponse> {
  const db = getServiceClient();
  const range = req.nextUrl.searchParams.get('range') || '7d';
  
  let daysBack = 7;
  switch (range) {
    case '24h': daysBack = 1; break;
    case '7d': daysBack = 7; break;
    case '30d': daysBack = 30; break;
    case '90d': daysBack = 90; break;
  }

  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Query usage over time
  const { data: usageData } = await db
    .from('tenant_usage')
    .select('period_start, queries_used, api_calls, storage_used_mb')
    .gte('period_start', startDate.toISOString())
    .order('period_start', { ascending: true });

  // Aggregate by day
  const dailyStats: Record<string, { queries: number; api_calls: number; storage: number }> = {};
  
  for (const row of usageData || []) {
    const day = row.period_start.split('T')[0];
    if (!dailyStats[day]) {
      dailyStats[day] = { queries: 0, api_calls: 0, storage: 0 };
    }
    dailyStats[day].queries += row.queries_used || 0;
    dailyStats[day].api_calls += row.api_calls || 0;
    dailyStats[day].storage = Math.max(dailyStats[day].storage, row.storage_used_mb || 0);
  }

  // Tenant growth
  const { data: tenantGrowth } = await db
    .from('tenants')
    .select('created_at')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  const dailyNewTenants: Record<string, number> = {};
  for (const row of tenantGrowth || []) {
    const day = row.created_at.split('T')[0];
    dailyNewTenants[day] = (dailyNewTenants[day] || 0) + 1;
  }

  // Plan distribution
  const { data: planDistribution } = await db
    .from('tenants')
    .select('plan')
    .eq('status', 'active');

  const planCounts: Record<string, number> = {};
  for (const row of planDistribution || []) {
    planCounts[row.plan] = (planCounts[row.plan] || 0) + 1;
  }

  return NextResponse.json({
    usage_over_time: Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      ...stats,
    })),
    tenant_growth: Object.entries(dailyNewTenants).map(([date, count]) => ({
      date,
      new_tenants: count,
    })),
    plan_distribution: planCounts,
  });
}

/**
 * Get system alerts
 */
async function getSystemAlerts(req: NextRequest): Promise<NextResponse> {
  const db = getServiceClient();
  const acknowledged = req.nextUrl.searchParams.get('acknowledged') === 'true';

  let query = db
    .from('system_alerts')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(50);

  if (!acknowledged) {
    query = query.eq('acknowledged', false);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch system alerts', { error: error.message });
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }

  // Generate synthetic alerts based on system state
  const alerts: SystemAlert[] = (data || []).map(row => ({
    id: row.id,
    severity: row.severity,
    title: row.title,
    message: row.message,
    timestamp: row.timestamp,
    acknowledged: row.acknowledged,
    tenant_id: row.tenant_id,
  }));

  // Add real-time alerts from monitoring
  try {
    // Check for high error rate
    if (redis) {
      const errorRate = await redis.get('metrics:error_rate');
      if (errorRate && parseFloat(errorRate) > 5) {
        alerts.unshift({
          id: 'rt-error-rate',
          severity: 'warning',
          title: 'Elevated Error Rate',
          message: `Current error rate is ${errorRate}%, above the 5% threshold`,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        });
      }

      // Check for high latency
      const p95Latency = await redis.get('metrics:p95_response_time');
      if (p95Latency && parseFloat(p95Latency) > 2000) {
        alerts.unshift({
          id: 'rt-high-latency',
          severity: 'warning',
          title: 'High Response Latency',
          message: `P95 latency is ${p95Latency}ms, above the 2000ms threshold`,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        });
      }
    }

    // Check for expiring trials
    const { data: expiringTrials } = await db
      .from('tenants')
      .select('tenant_id, name, expires_at')
      .eq('plan', 'trial')
      .lt('expires_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .gt('expires_at', new Date().toISOString());

    if (expiringTrials && expiringTrials.length > 0) {
      alerts.unshift({
        id: 'rt-expiring-trials',
        severity: 'info',
        title: `${expiringTrials.length} Trials Expiring Soon`,
        message: `${expiringTrials.map(t => t.name).join(', ')} will expire within 24 hours`,
        timestamp: new Date().toISOString(),
        acknowledged: false,
      });
    }
  } catch (e) {
    logger.warn('Failed to generate real-time alerts', { error: e });
  }

  return NextResponse.json({
    alerts,
    unacknowledged_count: alerts.filter(a => !a.acknowledged).length,
  });
}

/**
 * POST /api/admin/dashboard/alerts/:id/acknowledge
 * Acknowledge an alert
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { alert_id } = body;

    if (!alert_id) {
      return NextResponse.json(
        { error: 'alert_id is required' },
        { status: 400 }
      );
    }

    const db = getServiceClient();
    await db
      .from('system_alerts')
      .update({ acknowledged: true, acknowledged_by: authResult.adminId })
      .eq('id', alert_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to acknowledge alert', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to acknowledge alert' },
      { status: 500 }
    );
  }
}

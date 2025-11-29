import { NextRequest, NextResponse } from 'next/server';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

/**
 * POST /api/admin/metrics/aggregate
 *
 * Aggregates real-time usage events into daily/monthly metrics
 * This should be called periodically (e.g., via cron job)
 *
 * Authorization: Requires x-cron-secret header matching CRON_SECRET env var
 */
export async function POST(req: any, context: { params: Promise<{}> }) {
  const requestId = crypto.randomUUID();

  try {
    // Verify cron secret
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret !== process.env.CRON_SECRET) {
      TrialLogger.warn('Unauthorized aggregation request', { requestId });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call aggregation function
    const { error } = await supabase.rpc('aggregate_usage_metrics');

    if (error) {
      throw error;
    }

    // Call cleanup functions
    await Promise.all([
      supabase.rpc('cleanup_old_audit_events'),
      supabase.rpc('cleanup_old_realtime_events'),
    ]);

    TrialLogger.info('Usage metrics aggregated successfully', { requestId });

    return NextResponse.json({
      success: true,
      message: 'Usage metrics aggregated and old data cleaned up',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    TrialLogger.error(
      'Aggregation failed',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to aggregate metrics' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/metrics/status
 *
 * Get current status of aggregation and system health
 */
export async function GET(req: any, context: { params: Promise<{}> }) {
  try {
    // Check if we can access the database
    const { data: recentEvents, error: eventsError } = await supabase
      .from('tenant_usage_realtime')
      .select('*', { count: 'exact' })
      .order('event_timestamp', { ascending: false })
      .limit(1);

    const { data: recentMetrics, error: metricsError } = await supabase
      .from('tenant_usage_metrics')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .limit(1);

    if (eventsError || metricsError) {
      return NextResponse.json(
        { status: 'error', message: 'Database connection failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'healthy',
      recentEvents: recentEvents ? 1 : 0,
      recentMetrics: recentMetrics ? 1 : 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Status check failed' },
      { status: 500 }
    );
  }
}

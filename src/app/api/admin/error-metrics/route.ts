import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/error-metrics
 * Fetch system-wide error metrics
 */
export async function GET(req: any, context: { params: Promise<{}> }) {
  try {
    // Mock metrics - replace with actual Prometheus/metrics collection
    const metrics = {
      total_requests: 12450,
      failed_requests: 18,
      error_rate: 0.14,
      last_24h_errors: 18,
      trend: 'down' as const,
      recent_errors: [
        {
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          error_type: 'Rate Limit',
          count: 8,
        },
        {
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          error_type: 'Timeout',
          count: 6,
        },
        {
          timestamp: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
          error_type: 'Invalid Token',
          count: 4,
        },
      ],
    };

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Error in GET /api/admin/error-metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

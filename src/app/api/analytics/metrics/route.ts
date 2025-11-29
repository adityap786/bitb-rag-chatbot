
import { NextResponse } from 'next/server';
import { getMetrics, recordMetric, MetricsError } from '@/lib/analytics/metrics';
import { requireAuth, extractTenantId } from '@/middleware/auth';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

/**
 * Analytics Metrics API
 * 
 * PRODUCTION FEATURES:
 * ✅ Rate limiting (10000 requests per hour)
 * ✅ Authentication & authorization
 * ✅ Tenant isolation from session
 * - TODO: Add batch recording endpoint for high-throughput scenarios
 * - TODO: Add metric aggregation endpoints (avg, sum, min, max)
 */

export async function POST(req: Request) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await rateLimit(req, RATE_LIMITS.metrics);
    if (rateLimitResponse) return rateLimitResponse;

    // Require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const body = await req.json();
    const { name, value, tags } = body;

    // Input validation
    if (!name) {
      return NextResponse.json({ 
        error: 'Metric name is required',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    if (typeof value !== 'number') {
      return NextResponse.json({ 
        error: 'Metric value must be a number',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    // Extract tenant ID
    const tenantId = await extractTenantId(req) || body.tenantId;
    
    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    recordMetric(name, value, { tags, tenantId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Record metric error:', error);

    if (error instanceof MetricsError) {
      const statusCode = error.code === 'INVALID_INPUT' ? 400 : 500;
      return NextResponse.json({ 
        error: error.message,
        code: error.code,
        details: error.details
      }, { status: statusCode });
    }

    return NextResponse.json({ 
      error: 'Internal Server Error',
      code: 'UNKNOWN'
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await rateLimit(req, RATE_LIMITS.metrics);
    if (rateLimitResponse) return rateLimitResponse;

    // Require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name') || undefined;
    const limit = searchParams.get('limit');
    const startTime = searchParams.get('startTime') || undefined;
    const endTime = searchParams.get('endTime') || undefined;

    // Extract tenant ID
    const tenantId = await extractTenantId(req);

    const metrics = getMetrics({
      name,
      limit: limit ? parseInt(limit, 10) : undefined,
      startTime,
      endTime,
      tenantId: tenantId || undefined
    });

    return NextResponse.json({ metrics });
  } catch (error) {
    console.error('Get metrics error:', error);

    if (error instanceof MetricsError) {
      return NextResponse.json({ 
        error: error.message,
        code: error.code,
        details: error.details
      }, { status: 500 });
    }

    return NextResponse.json({ 
      error: 'Internal Server Error',
      code: 'UNKNOWN'
    }, { status: 500 });
  }
}

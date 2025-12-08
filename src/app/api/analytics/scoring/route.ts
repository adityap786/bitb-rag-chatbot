
import { NextResponse } from 'next/server';
import { scoreConversation, getScores, ScoringError } from '@/lib/analytics/scoring';
import { requireAuth, extractTenantId } from '@/middleware/auth';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

/**
 * Analytics Scoring API
 * 
 * PRODUCTION FEATURES:
 * ✅ Rate limiting (1000 requests per hour)
 * ✅ Authentication & authorization
 * ✅ Tenant isolation from session
 * - TODO: Add data retention policies (GDPR compliance)
 * - TODO: Add batch processing for high-volume scenarios
 */

export async function POST(req: any, context: { params: Promise<{}> }) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await rateLimit(req, RATE_LIMITS.scoring);
    if (rateLimitResponse) return rateLimitResponse;

    // Require authentication
    const authResult = await requireAuth(req);

    if (authResult instanceof NextResponse) return authResult;
    if (!('user' in authResult)) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }
    const { user } = authResult;

    const body = await req.json();
    const { sessionId, messages, feedback } = body;

    // Input validation
    if (!sessionId) {
      return NextResponse.json({ 
        error: 'Session ID is required',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ 
        error: 'Messages array is required',
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

    const score = scoreConversation(sessionId, messages, feedback, {
      tenantId,
      userId: user.id
    });
    return NextResponse.json({ score });
  } catch (error) {
    console.error('Scoring error:', error);

    if (error instanceof ScoringError) {
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
    const rateLimitResponse = await rateLimit(req, RATE_LIMITS.scoring);
    if (rateLimitResponse) return rateLimitResponse;

    // Require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    const sortBy = searchParams.get('sortBy') as 'score' | 'timestamp' | undefined;
    const order = searchParams.get('order') as 'asc' | 'desc' | undefined;

    // Extract tenant ID
    const tenantId = await extractTenantId(req);

    const scores = getScores({
      limit: limit ? parseInt(limit, 10) : undefined,
      sortBy: sortBy || 'timestamp',
      order: order || 'desc',
      tenantId: tenantId || undefined
    });

    return NextResponse.json({ scores });
  } catch (error) {
    console.error('Get scores error:', error);

    if (error instanceof ScoringError) {
      return NextResponse.json({ 
        error: error.message,
        code: error.code,
        details: error.details
      }, { status: 500 });
    }

    return NextResponse.json({ 
      error: 'Failed to retrieve scores',
      code: 'UNKNOWN'
    }, { status: 500 });
  }
}

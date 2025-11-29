/**
 * API Route: Badge Audit Trail
 * Retrieves audit trail for security badge interactions
 */

import { NextRequest, NextResponse } from 'next/server';
import { badgeAuditTrailLogger } from '@/lib/security/audit-trail-logger';
import { logger } from '@/lib/observability/logger';

export async function GET(request: any, context: { params: Promise<{}> }) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tenant_id = searchParams.get('tenant_id');
    const action = searchParams.get('action') || 'get_trail';

    if (!tenant_id) {
      return NextResponse.json(
        { error: 'tenant_id is required' },
        { status: 400 }
      );
    }

    // Validate authorization
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (action === 'get_trail') {
      const filters = {
        badge_type: searchParams.get('badge_type') || undefined,
        interaction_type: searchParams.get('interaction_type') || undefined,
        start_date: searchParams.get('start_date') || undefined,
        end_date: searchParams.get('end_date') || undefined,
      };

      const trail = await badgeAuditTrailLogger.getAuditTrail(
        tenant_id,
        filters
      );

      return NextResponse.json({ trail });
    } else if (action === 'get_stats') {
      const stats = await badgeAuditTrailLogger.getAuditStats(tenant_id);
      return NextResponse.json(stats);
    } else if (action === 'export') {
      const exported = await badgeAuditTrailLogger.exportAuditTrail(tenant_id);

      return new NextResponse(exported, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="badge-audit-trail-${tenant_id}-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('[API] Badge audit trail error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

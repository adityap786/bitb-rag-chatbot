import { NextRequest, NextResponse } from 'next/server';
import { AuthorizationError, InternalError } from '@/lib/trial/errors';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { requireAdmin } from '@/lib/auth/admin-middleware';

const supabase = createLazyServiceClient();

// Admin RBAC checks handled by centralized middleware: `requireAdmin`

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Require admin authentication (RBAC)
    const adminAuthErr = await requireAdmin(req);
    if (adminAuthErr) {
      TrialLogger.warn('Unauthorized admin access attempt', { requestId });
      TrialLogger.logRequest('GET', '/api/admin/trials', 403, Date.now() - startTime, { requestId });
      return adminAuthErr;
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const businessType = searchParams.get('businessType');
    const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get('pageSize') || '50', 10)));

    // Build query
    let query = supabase
      .from('tenants')
      .select(`
        *,
        knowledge_base(count),
        chat_sessions(count),
        widget_configs(assigned_tools)
      `);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (businessType && businessType !== 'all') {
      query = query.eq('business_type', businessType);
    }

    const { data: trials, error } = await query
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new InternalError('Failed to fetch trials', new Error(error.message));
    }

    // Calculate stats (efficient query)
    const { data: allTrials, error: statsError } = await supabase
      .from('tenants')
      .select('status');

    if (statsError) {
      TrialLogger.warn('Failed to calculate stats', { requestId, error: statsError.message });
    }

    const stats = {
      total: allTrials?.length || 0,
      active: allTrials?.filter((t: any) => t.status === 'active').length || 0,
      expired: allTrials?.filter((t: any) => t.status === 'expired').length || 0,
      upgraded: allTrials?.filter((t: any) => t.status === 'upgraded').length || 0,
      cancelled: allTrials?.filter((t: any) => t.status === 'cancelled').length || 0,
      conversionRate: 0,
    };

    if (stats.total > 0) {
      stats.conversionRate = Math.round((stats.upgraded / stats.total) * 100);
    }

    // Process trials data
    const processedTrials = (trials || []).map((trial: any) => ({
      ...trial,
      kb_count: Array.isArray(trial.knowledge_base) ? trial.knowledge_base.length : 0,
      chat_count: Array.isArray(trial.chat_sessions) ? trial.chat_sessions.length : 0,
      assigned_tools: trial.widget_configs?.[0]?.assigned_tools || [],
    }));

    TrialLogger.logRequest('GET', '/api/admin/trials', 200, Date.now() - startTime, {
      requestId,
      trialsCount: processedTrials.length,
      filters: { status, businessType },
    });

    return NextResponse.json({
      trials: processedTrials,
      stats,
      pagination: { page, pageSize, total: stats.total },
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AuthorizationError) {
      TrialLogger.logRequest('GET', '/api/admin/trials', 403, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof InternalError) {
      TrialLogger.error(error.message, error, { requestId });
      TrialLogger.logRequest('GET', '/api/admin/trials', 500, duration, { requestId });
      return NextResponse.json(
        { error: 'Failed to fetch trials' },
        { status: 500 }
      );
    }

    TrialLogger.error('Unexpected error in admin trials GET', error as Error, { requestId });
    TrialLogger.logRequest('GET', '/api/admin/trials', 500, duration, { requestId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

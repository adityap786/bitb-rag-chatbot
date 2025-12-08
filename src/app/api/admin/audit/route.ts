/**
 * @module Admin Audit Logs API
 * @description Production-grade API endpoints for viewing admin audit logs
 * 
 * GET /api/admin/audit - List audit logs with filtering
 * 
 * Supports:
 * - Admin authentication and RBAC
 * - Filtering by admin, tenant, action, date range
 * - Pagination
 * - Action summary statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAuth } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase-client';

const querySchema = z.object({
  admin_id: z.string().uuid().optional(),
  tenant_id: z.string().optional(),
  action: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await AdminAuth.requireAuth(request, ['super_admin', 'admin']);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const adminSession = authResult;

    // Parse query params
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const params = querySchema.parse(searchParams);

    const supabase = getServiceClient();
    const offset = (params.page - 1) * params.limit;

    // Build query for admin_audit_log (new table) and chat_audit (legacy)
    let query = supabase
      .from('admin_audit_log')
      .select(`
        *,
        admin:admin_users(admin_id, email, name),
        tenant:tenants(tenant_id, name)
      `, { count: 'exact' });

    // Apply filters
    if (params.admin_id) {
      query = query.eq('admin_id', params.admin_id);
    }

    if (params.tenant_id) {
      query = query.eq('target_tenant_id', params.tenant_id);
    }

    if (params.action) {
      query = query.ilike('action', `%${params.action}%`);
    }

    if (params.start_date) {
      query = query.gte('timestamp', params.start_date);
    }

    if (params.end_date) {
      query = query.lte('timestamp', params.end_date);
    }

    // Order and paginate
    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + params.limit - 1);

    const { data: logs, error, count } = await query;

    if (error) {
      // Fallback to chat_audit table if admin_audit_log doesn't exist yet
      const fallbackQuery = supabase
        .from('chat_audit')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })
        .range(offset, offset + params.limit - 1);

      if (params.tenant_id) {
        fallbackQuery.eq('tenant_id', params.tenant_id);
      }

      const fallback = await fallbackQuery;

      if (fallback.error) {
        throw fallback.error;
      }

      return NextResponse.json({
        success: true,
        data: {
          logs: fallback.data || [],
          pagination: {
            page: params.page,
            limit: params.limit,
            total: fallback.count || 0,
            total_pages: Math.ceil((fallback.count || 0) / params.limit),
          },
          summary: {
            action_counts: {},
          },
          source: 'chat_audit_legacy',
        },
      });
    }

    // Get action summary for the period
    const summaryQuery = supabase
      .from('admin_audit_log')
      .select('action');

    if (params.start_date) {
      summaryQuery.gte('timestamp', params.start_date);
    }
    if (params.end_date) {
      summaryQuery.lte('timestamp', params.end_date);
    }

    const { data: allActions } = await summaryQuery;

    // Count actions by type
    const actionCounts: Record<string, number> = {};
    allActions?.forEach((log: { action: string }) => {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    });

    // Log this access
    await AdminAuth.logAuditEntry(
      adminSession.admin_id,
      'audit_logs_viewed',
      undefined,
      {
        filters: params,
        results_count: count,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        logs: logs || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / params.limit),
        },
        summary: {
          action_counts: actionCounts,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Audit logs error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}

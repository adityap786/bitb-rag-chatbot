/**
 * @module Admin System Alerts API
 * @description API endpoints for system alerts management
 * 
 * GET /api/admin/alerts - List system alerts
 * POST /api/admin/alerts - Create new alert
 * PATCH /api/admin/alerts - Acknowledge or resolve alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAuth } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase-client';

// ============================================================
// Types
// ============================================================

type AlertSeverity = 'critical' | 'warning' | 'info';

interface SystemAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  tenant_id?: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved: boolean;
  resolved_at?: string;
  timestamp: string;
}

// ============================================================
// Validation Schemas
// ============================================================

const getAlertsSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  acknowledged: z.coerce.boolean().optional(),
  resolved: z.coerce.boolean().optional(),
  tenant_id: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const createAlertSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']),
  title: z.string().min(1).max(200),
  message: z.string().min(1),
  tenant_id: z.string().optional(),
  auto_resolve: z.boolean().default(false),
});

const updateAlertSchema = z.object({
  alert_ids: z.array(z.string().uuid()),
  action: z.enum(['acknowledge', 'resolve', 'dismiss']),
});

// ============================================================
// GET: List alerts
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const authResult = await AdminAuth.requireAuth(request, ['super_admin', 'admin', 'support']);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const params = getAlertsSchema.parse(searchParams);

    const supabase = getServiceClient();
    const offset = (params.page - 1) * params.limit;

    // Build query
    let query = supabase
      .from('system_alerts')
      .select(`
        *,
        acknowledger:admin_users!acknowledged_by(admin_id, name, email),
        tenant:tenants(tenant_id, name)
      `, { count: 'exact' });

    // Apply filters
    if (params.severity) {
      query = query.eq('severity', params.severity);
    }

    if (params.acknowledged !== undefined) {
      query = query.eq('acknowledged', params.acknowledged);
    }

    if (params.resolved !== undefined) {
      query = query.eq('resolved', params.resolved);
    }

    if (params.tenant_id) {
      query = query.eq('tenant_id', params.tenant_id);
    }

    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + params.limit - 1);

    const { data: alerts, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get summary counts
    const { data: summary } = await supabase
      .from('system_alerts')
      .select('severity, acknowledged, resolved')
      .eq('resolved', false);

    const summaryCounts = {
      critical_unacked: 0,
      warning_unacked: 0,
      info_unacked: 0,
      total_unresolved: 0,
    };

    summary?.forEach((alert: { severity: string; acknowledged: boolean; resolved: boolean }) => {
      if (!alert.resolved) {
        summaryCounts.total_unresolved++;
        if (!alert.acknowledged) {
          if (alert.severity === 'critical') summaryCounts.critical_unacked++;
          else if (alert.severity === 'warning') summaryCounts.warning_unacked++;
          else summaryCounts.info_unacked++;
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        alerts: alerts || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / params.limit),
        },
        summary: summaryCounts,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: error.issues },
        { status: 400 }
      );
    }

    console.error('List alerts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST: Create new alert
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const authResult = await AdminAuth.requireAuth(request, ['super_admin', 'admin']);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const adminSession = authResult;
    const body = await request.json();
    const data = createAlertSchema.parse(body);

    const supabase = getServiceClient();

    const { data: alert, error } = await supabase
      .from('system_alerts')
      .insert({
        severity: data.severity,
        title: data.title,
        message: data.message,
        tenant_id: data.tenant_id,
        auto_resolve: data.auto_resolve,
        acknowledged: false,
        resolved: false,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Log audit entry
    await AdminAuth.logAuditEntry(
      adminSession.admin_id,
      'alert_created',
      data.tenant_id,
      {
        alert_id: alert.id,
        severity: data.severity,
        title: data.title,
      }
    );

    return NextResponse.json({
      success: true,
      data: { alert },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Create alert error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH: Acknowledge or resolve alerts
// ============================================================

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await AdminAuth.requireAuth(request, ['super_admin', 'admin', 'support']);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const adminSession = authResult;
    const body = await request.json();
    const data = updateAlertSchema.parse(body);

    const supabase = getServiceClient();
    const now = new Date().toISOString();

    let updateData: Record<string, unknown> = {};

    switch (data.action) {
      case 'acknowledge':
        updateData = {
          acknowledged: true,
          acknowledged_by: adminSession.admin_id,
          acknowledged_at: now,
        };
        break;
      case 'resolve':
        updateData = {
          resolved: true,
          resolved_at: now,
        };
        break;
      case 'dismiss':
        updateData = {
          acknowledged: true,
          acknowledged_by: adminSession.admin_id,
          acknowledged_at: now,
          resolved: true,
          resolved_at: now,
        };
        break;
    }

    const { data: updated, error } = await supabase
      .from('system_alerts')
      .update(updateData)
      .in('id', data.alert_ids)
      .select();

    if (error) {
      throw error;
    }

    // Log audit entry
    await AdminAuth.logAuditEntry(
      adminSession.admin_id,
      `alerts_${data.action}d`,
      undefined,
      {
        alert_ids: data.alert_ids,
        count: updated?.length || 0,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        updated_count: updated?.length || 0,
        alerts: updated,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Update alerts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update alerts' },
      { status: 500 }
    );
  }
}

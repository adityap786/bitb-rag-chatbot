/**
 * Admin Tenant Actions API - Suspend/Reactivate/Upgrade
 * 
 * Endpoints:
 * - POST /api/admin/tenants/[tenantId]/suspend - Suspend tenant
 * - POST /api/admin/tenants/[tenantId]/reactivate - Reactivate tenant
 * - POST /api/admin/tenants/[tenantId]/upgrade - Upgrade tenant plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TenantManager, TenantPlan } from '@/lib/tenant/tenant-manager';
import { logger } from '@/lib/observability/logger';
import { verifyAdminAuth } from '@/lib/admin';

// ============================================================================
// Validation Schemas
// ============================================================================

const SuspendSchema = z.object({
  reason: z.string().min(1).max(500),
});

const UpgradeSchema = z.object({
  plan: z.enum(['starter', 'professional', 'enterprise', 'custom']),
});

// ============================================================================
// Route Handlers
// ============================================================================

interface RouteContext {
  params: Promise<{ tenantId: string; action: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { tenantId, action } = await context.params;

    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    const tenantManager = new TenantManager();

    // Check tenant exists
    const existing = await tenantManager.getTenantConfig(tenantId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    switch (action) {
      case 'suspend': {
        const body = await req.json();
        const validation = SuspendSchema.safeParse(body);
        
        if (!validation.success) {
          return NextResponse.json(
            { error: 'Invalid request', details: validation.error.issues },
            { status: 400 }
          );
        }

        await tenantManager.suspendTenant(tenantId, validation.data.reason);

        logger.info('Admin suspended tenant', {
          admin_id: authResult.adminId,
          tenant_id: tenantId,
          reason: validation.data.reason,
        });

        return NextResponse.json({
          success: true,
          message: 'Tenant suspended successfully',
          status: 'suspended',
        });
      }

      case 'reactivate': {
        if (existing.status !== 'suspended') {
          return NextResponse.json(
            { error: 'Tenant is not suspended' },
            { status: 400 }
          );
        }

        await tenantManager.reactivateTenant(tenantId);

        logger.info('Admin reactivated tenant', {
          admin_id: authResult.adminId,
          tenant_id: tenantId,
        });

        return NextResponse.json({
          success: true,
          message: 'Tenant reactivated successfully',
          status: 'active',
        });
      }

      case 'upgrade': {
        const body = await req.json();
        const validation = UpgradeSchema.safeParse(body);
        
        if (!validation.success) {
          return NextResponse.json(
            { error: 'Invalid request', details: validation.error.issues },
            { status: 400 }
          );
        }

        await tenantManager.upgradePlan(tenantId, validation.data.plan as TenantPlan);

        logger.info('Admin upgraded tenant plan', {
          admin_id: authResult.adminId,
          tenant_id: tenantId,
          old_plan: existing.plan,
          new_plan: validation.data.plan,
        });

        return NextResponse.json({
          success: true,
          message: 'Tenant plan upgraded successfully',
          plan: validation.data.plan,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 404 }
        );
    }
  } catch (error) {
    logger.error('Failed to perform tenant action', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to perform action', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

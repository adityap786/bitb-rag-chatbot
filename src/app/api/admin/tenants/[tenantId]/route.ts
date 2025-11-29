/**
 * Admin Tenant Detail API - Individual Tenant Management
 * 
 * Endpoints:
 * - GET /api/admin/tenants/[tenantId] - Get tenant details
 * - PUT /api/admin/tenants/[tenantId] - Update tenant
 * - DELETE /api/admin/tenants/[tenantId] - Delete tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TenantManager } from '@/lib/tenant/tenant-manager';
import { logger } from '@/lib/observability/logger';
import { verifyAdminAuth } from '@/lib/admin';

// ============================================================================
// Validation Schemas
// ============================================================================

const UpdateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  branding: z.object({
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    logo_url: z.string().url().optional(),
    widget_position: z.enum(['bottom-right', 'bottom-left']),
    chat_tone: z.enum(['professional', 'friendly', 'casual']),
    welcome_message: z.string().min(1).max(500),
  }).optional(),
  quota: z.object({
    queries_per_day: z.number().min(0),
    queries_per_minute: z.number().min(0),
    storage_mb: z.number().min(0),
    embeddings_count: z.number().min(0),
    concurrent_sessions: z.number().min(0),
    api_calls_per_day: z.number().min(0),
    file_uploads_per_day: z.number().min(0),
    max_file_size_mb: z.number().min(0),
  }).optional(),
  features: z.object({
    rag_enabled: z.boolean(),
    mcp_enabled: z.boolean(),
    voice_enabled: z.boolean(),
    analytics_enabled: z.boolean(),
    custom_branding: z.boolean(),
    api_access: z.boolean(),
    webhook_integration: z.boolean(),
    sso_enabled: z.boolean(),
    audit_logging: z.boolean(),
    priority_support: z.boolean(),
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Route Handlers
// ============================================================================

interface RouteContext {
  params: Promise<{ tenantId: string }>;
}

/**
 * GET /api/admin/tenants/[tenantId]
 * Get detailed tenant information
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { tenantId } = await context.params;

    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    const tenantManager = new TenantManager();
    const config = await tenantManager.getTenantConfig(tenantId);

    if (!config) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Get usage statistics
    const usage = await tenantManager.getCurrentUsage(tenantId);

    logger.info('Admin viewed tenant', {
      admin_id: authResult.adminId,
      tenant_id: tenantId,
    });

    return NextResponse.json({
      tenant: config,
      usage,
    });
  } catch (error) {
    logger.error('Failed to get tenant', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/tenants/[tenantId]
 * Update tenant configuration
 */
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const { tenantId } = await context.params;

    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = UpdateTenantSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
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

    // Update tenant
    const updated = await tenantManager.updateTenantConfig(tenantId, validation.data);

    logger.info('Admin updated tenant', {
      admin_id: authResult.adminId,
      tenant_id: tenantId,
      updates: Object.keys(validation.data),
    });

    return NextResponse.json({
      success: true,
      tenant: updated,
    });
  } catch (error) {
    logger.error('Failed to update tenant', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to update tenant', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/tenants/[tenantId]
 * Delete (deprovision) a tenant
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { tenantId } = await context.params;

    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    // Get reason from query params
    const reason = req.nextUrl.searchParams.get('reason') || 'Admin deletion';

    const tenantManager = new TenantManager();
    
    // Check tenant exists
    const existing = await tenantManager.getTenantConfig(tenantId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Deprovision tenant
    await tenantManager.deprovisionTenant(tenantId, reason);

    logger.info('Admin deleted tenant', {
      admin_id: authResult.adminId,
      tenant_id: tenantId,
      reason,
    });

    return NextResponse.json({
      success: true,
      message: 'Tenant deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete tenant', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to delete tenant', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

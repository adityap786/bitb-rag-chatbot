/**
 * Admin Tenants API - Production-Grade Tenant Management
 * 
 * Endpoints:
 * - GET /api/admin/tenants - List all tenants with filtering
 * - GET /api/admin/tenants/:id - Get tenant details
 * - POST /api/admin/tenants - Create new tenant
 * - PUT /api/admin/tenants/:id - Update tenant
 * - POST /api/admin/tenants/:id/suspend - Suspend tenant
 * - POST /api/admin/tenants/:id/reactivate - Reactivate tenant
 * - DELETE /api/admin/tenants/:id - Delete tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TenantManager, TenantStatus, TenantPlan } from '@/lib/tenant/tenant-manager';
import { logger } from '@/lib/observability/logger';
import { verifyAdminAuth } from '@/lib/admin';

// ============================================================================
// Validation Schemas
// ============================================================================

const ListTenantsSchema = z.object({
  status: z.enum(['pending', 'provisioning', 'active', 'suspended', 'expired', 'deprovisioning', 'deleted']).optional(),
  plan: z.enum(['trial', 'starter', 'professional', 'enterprise', 'custom']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  orderBy: z.enum(['created_at', 'updated_at', 'name', 'email']).default('created_at'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

const CreateTenantSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  plan: z.enum(['trial', 'starter', 'professional', 'enterprise', 'custom']).optional(),
  business_type: z.string().optional(),
  industry: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

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

const SuspendTenantSchema = z.object({
  reason: z.string().min(1).max(500),
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/admin/tenants
 * List all tenants with filtering and pagination
 */
export async function GET(req: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    // Parse query parameters
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const validation = ListTenantsSchema.safeParse(searchParams);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: validation.error.issues },
        { status: 400 }
      );
    }

    const params = validation.data;
    const tenantManager = new TenantManager();

    const result = await tenantManager.listTenants({
      status: params.status as TenantStatus | undefined,
      plan: params.plan as TenantPlan | undefined,
      search: params.search,
      limit: params.limit,
      offset: params.offset,
      orderBy: params.orderBy,
      orderDir: params.orderDir,
    });

    logger.info('Admin listed tenants', {
      admin_id: authResult.adminId,
      filters: { status: params.status, plan: params.plan, search: params.search },
      result_count: result.tenants.length,
      total: result.total,
    });

    return NextResponse.json({
      tenants: result.tenants,
      pagination: {
        total: result.total,
        limit: params.limit,
        offset: params.offset,
        has_more: params.offset + result.tenants.length < result.total,
      },
    });
  } catch (error) {
    logger.error('Failed to list tenants', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tenants
 * Create a new tenant
 */
export async function POST(req: NextRequest) {
  try {
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
    const validation = CreateTenantSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const tenantManager = new TenantManager();
    const result = await tenantManager.provisionTenant(validation.data);

    logger.info('Admin created tenant', {
      admin_id: authResult.adminId,
      tenant_id: result.tenant_id,
      email: validation.data.email,
    });

    return NextResponse.json({
      success: true,
      tenant_id: result.tenant_id,
      api_key: result.api_key,
      setup_token: result.setup_token,
      config: result.config,
    }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create tenant', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to create tenant', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

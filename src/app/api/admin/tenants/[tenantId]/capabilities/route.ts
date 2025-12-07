/**
 * Admin Tenant Capabilities API - P0 Fix: MCP/LLM/Tools Provisioning
 * 
 * POST /api/admin/tenants/[tenantId]/capabilities
 * 
 * Enables admins to provision MCP, LLM, and deterministic tools for tenants.
 * Includes audit logging and role-based access control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth, checkPermission } from '@/lib/admin/auth';
import { logger } from '@/lib/observability/logger';

// ============================================================================
// Types
// ============================================================================

interface CapabilitiesUpdateRequest {
  // MCP Configuration
  mcp_enabled?: boolean;
  mcp_endpoint?: string;
  
  // LLM Configuration
  llm_enabled?: boolean;
  llm_provider?: 'groq';
  llm_model?: string;
  llm_max_tokens?: number;
  llm_temperature?: number;
  
  // Tools Configuration
  enabled_tools?: string[];
  tool_configs?: Record<string, Record<string, unknown>>;
  
  // Rate Limits
  rate_limit_queries?: number;
  rate_limit_ingestion?: number;
  
  // Quotas
  query_quota_daily?: number;
  storage_quota_mb?: number;
  embedding_quota?: number;
  
  // Feature Flags
  feature_flags?: Record<string, boolean>;
}

// Available tools registry
const AVAILABLE_TOOLS = [
  'search_knowledge',
  'check_trial_status',
  'get_product_info',
  'summarize_document',
  'extract_entities',
  'generate_suggestions',
  'check_inventory',
  'calculate_pricing',
  'schedule_appointment',
  'send_notification',
];

// ============================================================================
// POST Handler - Update Capabilities
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();
  const { tenantId: tenant_id } = await params;

  try {
    // Verify admin authentication
    const authResult = await verifyAdminAuth(request);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Check permission
    const permResult = await checkPermission(request, 'tenants:update');
    if (!permResult.hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Validate tenant_id format
    if (!tenant_id || !/^tn_[a-f0-9]{32}$/.test(tenant_id)) {
      return NextResponse.json(
        { error: 'Invalid tenant_id format', code: 'INVALID_TENANT_ID' },
        { status: 400 }
      );
    }

    // Parse request body
    const body: CapabilitiesUpdateRequest = await request.json();

    // Validate tools
    if (body.enabled_tools) {
      const invalidTools = body.enabled_tools.filter(
        (tool) => !AVAILABLE_TOOLS.includes(tool)
      );
      if (invalidTools.length > 0) {
        return NextResponse.json(
          {
            error: `Invalid tools: ${invalidTools.join(', ')}`,
            code: 'INVALID_TOOLS',
            available_tools: AVAILABLE_TOOLS,
          },
          { status: 400 }
        );
      }
    }

    // Validate LLM provider
    if (body.llm_provider && body.llm_provider !== 'groq') {
      return NextResponse.json(
        { error: 'Invalid LLM provider. Supported: groq', code: 'INVALID_LLM_PROVIDER' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const db = createClient(supabaseUrl, supabaseKey);

    // Get current capabilities for audit
    const { data: currentCaps } = await db
      .from('tenant_capabilities')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    // Build update object
    const updateData: Record<string, unknown> = {
      tenant_id,
      updated_at: new Date().toISOString(),
      updated_by: authResult.adminId,
    };

    // Map request fields to database columns
    if (body.mcp_enabled !== undefined) updateData.mcp_enabled = body.mcp_enabled;
    if (body.mcp_endpoint !== undefined) updateData.mcp_endpoint = body.mcp_endpoint;
    if (body.llm_enabled !== undefined) updateData.llm_enabled = body.llm_enabled;
    if (body.llm_provider !== undefined) updateData.llm_provider = body.llm_provider;
    if (body.llm_model !== undefined) updateData.llm_model = body.llm_model;
    if (body.llm_max_tokens !== undefined) updateData.llm_max_tokens = body.llm_max_tokens;
    if (body.llm_temperature !== undefined) updateData.llm_temperature = body.llm_temperature;
    if (body.enabled_tools !== undefined) updateData.enabled_tools = body.enabled_tools;
    if (body.tool_configs !== undefined) updateData.tool_configs = body.tool_configs;
    if (body.rate_limit_queries !== undefined) updateData.rate_limit_queries = body.rate_limit_queries;
    if (body.rate_limit_ingestion !== undefined) updateData.rate_limit_ingestion = body.rate_limit_ingestion;
    if (body.query_quota_daily !== undefined) updateData.query_quota_daily = body.query_quota_daily;
    if (body.storage_quota_mb !== undefined) updateData.storage_quota_mb = body.storage_quota_mb;
    if (body.embedding_quota !== undefined) updateData.embedding_quota = body.embedding_quota;
    if (body.feature_flags !== undefined) updateData.feature_flags = body.feature_flags;

    // Upsert capabilities
    const { data: updatedCaps, error: updateError } = await db
      .from('tenant_capabilities')
      .upsert(updateData, {
        onConflict: 'tenant_id',
      })
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update tenant capabilities', {
        tenant_id,
        error: updateError.message,
      });
      return NextResponse.json(
        { error: 'Failed to update capabilities', code: 'UPDATE_FAILED' },
        { status: 500 }
      );
    }

    // Create audit log entry
    await db.from('admin_audit_log').insert({
      admin_id: authResult.adminId,
      admin_email: authResult.email,
      admin_role: authResult.role,
      action: currentCaps ? 'update' : 'create',
      resource_type: 'capabilities',
      resource_id: tenant_id,
      previous_state: currentCaps || null,
      new_state: updatedCaps,
      change_summary: buildChangeSummary(currentCaps, body),
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      user_agent: request.headers.get('user-agent'),
    });

    logger.log('Tenant capabilities updated', {
      tenant_id,
      admin_id: authResult.adminId,
      changes: Object.keys(body),
      duration_ms: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      tenant_id,
      capabilities: updatedCaps,
      mcp_endpoint: body.mcp_enabled
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/mcp/${tenant_id}`
        : null,
    });
  } catch (error) {
    logger.error('Capabilities update error', {
      tenant_id,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET Handler - Get Capabilities
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  const { tenantId: tenant_id } = await params;

  try {
    // Verify admin authentication
    const authResult = await verifyAdminAuth(request);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Check permission
    const permResult = await checkPermission(request, 'tenants:read');
    if (!permResult.hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Validate tenant_id format
    if (!tenant_id || !/^tn_[a-f0-9]{32}$/.test(tenant_id)) {
      return NextResponse.json(
        { error: 'Invalid tenant_id format', code: 'INVALID_TENANT_ID' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const db = createClient(supabaseUrl, supabaseKey);

    const { data: capabilities, error } = await db
      .from('tenant_capabilities')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Failed to fetch capabilities', { tenant_id, error: error.message });
      return NextResponse.json(
        { error: 'Failed to fetch capabilities', code: 'FETCH_FAILED' },
        { status: 500 }
      );
    }

    // Return defaults if no capabilities configured
    if (!capabilities) {
      return NextResponse.json({
        tenant_id,
        capabilities: getDefaultCapabilities(tenant_id),
        is_default: true,
        available_tools: AVAILABLE_TOOLS,
      });
    }

    return NextResponse.json({
      tenant_id,
      capabilities,
      is_default: false,
      available_tools: AVAILABLE_TOOLS,
    });
  } catch (error) {
    logger.error('Get capabilities error', {
      tenant_id,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE Handler - Reset to Defaults
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  const { tenantId: tenant_id } = await params;

  try {
    const authResult = await verifyAdminAuth(request);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const permResult = await checkPermission(request, 'tenants:update');
    if (!permResult.hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const db = createClient(supabaseUrl, supabaseKey);

    // Get current for audit
    const { data: currentCaps } = await db
      .from('tenant_capabilities')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    // Delete capabilities (will use defaults)
    const { error } = await db
      .from('tenant_capabilities')
      .delete()
      .eq('tenant_id', tenant_id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to reset capabilities', code: 'RESET_FAILED' },
        { status: 500 }
      );
    }

    // Audit log
    await db.from('admin_audit_log').insert({
      admin_id: authResult.adminId,
      admin_email: authResult.email,
      admin_role: authResult.role,
      action: 'delete',
      resource_type: 'capabilities',
      resource_id: tenant_id,
      previous_state: currentCaps,
      new_state: null,
      change_summary: 'Reset capabilities to defaults',
    });

    return NextResponse.json({
      success: true,
      tenant_id,
      message: 'Capabilities reset to defaults',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultCapabilities(tenant_id: string) {
  return {
    tenant_id,
    mcp_enabled: false,
    llm_enabled: true,
    llm_provider: 'groq',
    llm_model: 'llama-3.3-70b-versatile',
    llm_max_tokens: 1024,
    llm_temperature: 0.2,
    enabled_tools: [],
    tool_configs: {},
    rate_limit_queries: 10,
    rate_limit_ingestion: 5,
    query_quota_daily: 1000,
    storage_quota_mb: 100,
    embedding_quota: 10000,
    feature_flags: {
      hybrid_search: true,
      reranking: false,
      voice_greeting: true,
      analytics: false,
      custom_prompts: false,
    },
  };
}

function buildChangeSummary(
  previous: Record<string, unknown> | null,
  changes: CapabilitiesUpdateRequest
): string {
  const summaryParts: string[] = [];

  if (changes.mcp_enabled !== undefined) {
    summaryParts.push(`MCP ${changes.mcp_enabled ? 'enabled' : 'disabled'}`);
  }
  if (changes.llm_provider) {
    summaryParts.push(`LLM provider changed to ${changes.llm_provider}`);
  }
  if (changes.enabled_tools) {
    summaryParts.push(`Tools updated: ${changes.enabled_tools.join(', ') || 'none'}`);
  }
  if (changes.rate_limit_queries) {
    summaryParts.push(`Rate limit changed to ${changes.rate_limit_queries}/min`);
  }

  return summaryParts.join('; ') || 'Capabilities updated';
}

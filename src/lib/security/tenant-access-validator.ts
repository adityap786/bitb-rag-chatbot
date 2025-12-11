/**
 * Tenant Access Validator - Cross-Tenant Attack Prevention
 * 
 * Production-grade validation for ALL tenant-scoped operations.
 * Prevents cross-tenant data access through multiple defense layers.
 * 
 * Date: 2025-11-19
 * Compliance: ISO 27001 (A.9.4.1), SOC 2 Type II (Security)
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { logger } from '../observability/logger';
import { AuditLogger, AuditEventType } from './audit-logging.js';

/**
 * Tenant ID format: tn_[32 hex chars]
 * Trial token format: tr_[32 hex chars]
 */
const TENANT_ID_REGEX = /^tn_[a-f0-9]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRIAL_TOKEN_REGEX = /^tr_[a-f0-9]{32}$/;

export interface TenantAccessContext {
  tenant_id: string;
  operation: string;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
}

export class TenantAccessViolationError extends Error {
  constructor(
    message: string,
    public readonly context: TenantAccessContext,
    public readonly severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' = 'CRITICAL'
  ) {
    super(message);
    this.name = 'TenantAccessViolationError';
  }
}

/**
 * Validates tenant ID format and existence
 * Throws TenantAccessViolationError if invalid
 */
export async function validateTenantAccess(
  tenant_id: string,
  context: Omit<TenantAccessContext, 'tenant_id'>
): Promise<void> {
  const fullContext: TenantAccessContext = { tenant_id, ...context };

  // Step 1: Format validation
  if (!tenant_id || typeof tenant_id !== 'string') {
    await logAccessViolation(fullContext, 'MISSING_TENANT_ID');
    throw new TenantAccessViolationError(
      'SECURITY: tenant_id is required',
      fullContext,
      'CRITICAL'
    );
  }

  if (!TENANT_ID_REGEX.test(tenant_id)) {
    await logAccessViolation(fullContext, 'INVALID_TENANT_ID_FORMAT');
    throw new TenantAccessViolationError(
      `SECURITY: Invalid tenant_id format. Expected tn_[32 hex], got ${tenant_id.substring(0, 10)}...`,
      fullContext,
      'CRITICAL'
    );
  }

  // Step 2: Verify tenant exists and is active
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const client = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await client
      .from('trial_tenants')
      .select('tenant_id, status, trial_expires_at')
      .eq('tenant_id', tenant_id)
      .single();

    if (error || !data) {
      await logAccessViolation(fullContext, 'TENANT_NOT_FOUND');
      throw new TenantAccessViolationError(
        'SECURITY: Tenant not found or inactive',
        fullContext,
        'HIGH'
      );
    }

    if (data.status !== 'active' && data.status !== 'trial') {
      await logAccessViolation(fullContext, 'TENANT_INACTIVE');
      throw new TenantAccessViolationError(
        `SECURITY: Tenant status is ${data.status}`,
        fullContext,
        'HIGH'
      );
    }

    // Check if trial expired
    if (data.trial_expires_at && new Date(data.trial_expires_at) < new Date()) {
      await logAccessViolation(fullContext, 'TRIAL_EXPIRED');
      throw new TenantAccessViolationError(
        'SECURITY: Trial has expired',
        fullContext,
        'MEDIUM'
      );
    }

    logger.debug('Tenant access validated', {
      tenant_id_hash: hashTenantId(tenant_id),
      operation: context.operation,
    });
  } catch (error) {
    if (error instanceof TenantAccessViolationError) {
      throw error;
    }
    logger.error('Tenant validation error', { error, context: fullContext });
    throw new TenantAccessViolationError(
      'SECURITY: Tenant validation failed',
      fullContext,
      'CRITICAL'
    );
  }
}

/**
 * Validates that a resource belongs to the specified tenant
 * Prevents cross-tenant resource access
 */
export async function validateResourceOwnership(
  tenant_id: string,
  resource_type: 'embedding' | 'knowledge_base' | 'chat_session' | 'widget_config',
  resource_id: string
): Promise<void> {
  const context: TenantAccessContext = {
    tenant_id,
    operation: 'resource_access',
    resource_type,
    resource_id,
  };

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const client = createClient(supabaseUrl, supabaseKey);

    // Set RLS context
    await client.rpc('set_tenant_context', { p_tenant_id: tenant_id });

    // Map resource type to table name
    const tableMap = {
      embedding: 'embeddings',
      knowledge_base: 'knowledge_base',
      chat_session: 'chat_sessions',
      widget_config: 'widget_configs',
    };

    const tableName = tableMap[resource_type];
    const idColumn = resource_type === 'embedding' ? 'embedding_id' :
                     resource_type === 'knowledge_base' ? 'kb_id' :
                     resource_type === 'chat_session' ? 'session_id' : 'config_id';

    // Query with explicit tenant_id filter
    const { data, error } = await client
      .from(tableName)
      .select('tenant_id')
      .eq(idColumn, resource_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (error || !data) {
      await logAccessViolation(context, 'RESOURCE_NOT_FOUND');
      throw new TenantAccessViolationError(
        `SECURITY: Resource ${resource_type}:${resource_id} not found or access denied`,
        context,
        'CRITICAL'
      );
    }

    if (data.tenant_id !== tenant_id) {
      await logAccessViolation(context, 'CROSS_TENANT_ACCESS_ATTEMPT');
      throw new TenantAccessViolationError(
        `SECURITY: Cross-tenant access attempt detected. Resource belongs to different tenant`,
        context,
        'CRITICAL'
      );
    }

    logger.debug('Resource ownership validated', {
      tenant_id_hash: hashTenantId(tenant_id),
      resource_type,
      resource_id,
    });
  } catch (error) {
    if (error instanceof TenantAccessViolationError) {
      throw error;
    }
    logger.error('Resource ownership validation error', { error, context });
    throw new TenantAccessViolationError(
      'SECURITY: Resource ownership validation failed',
      context,
      'CRITICAL'
    );
  }
}

/**
 * Validates trial token and ensures it maps to the correct tenant
 */
export async function validateTrialTokenOwnership(
  trial_token: string,
  tenant_id: string
): Promise<void> {
  const context: TenantAccessContext = {
    tenant_id,
    operation: 'trial_token_validation',
  };

  if (!trial_token || typeof trial_token !== 'string') {
    await logAccessViolation(context, 'INVALID_TRIAL_TOKEN');
    throw new TenantAccessViolationError(
      'SECURITY: trial_token is required',
      context,
      'HIGH'
    );
  }

  if (!TRIAL_TOKEN_REGEX.test(trial_token)) {
    await logAccessViolation(context, 'INVALID_TRIAL_TOKEN_FORMAT');
    throw new TenantAccessViolationError(
      'SECURITY: Invalid trial_token format',
      context,
      'HIGH'
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const client = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await client
      .from('trials')
      .select('tenant_id, status, expires_at')
      .eq('trial_token', trial_token)
      .single();

    if (error || !data) {
      await logAccessViolation(context, 'TRIAL_TOKEN_NOT_FOUND');
      throw new TenantAccessViolationError(
        'SECURITY: Trial token not found or expired',
        context,
        'HIGH'
      );
    }

    if (data.tenant_id !== tenant_id) {
      await logAccessViolation(context, 'TRIAL_TOKEN_TENANT_MISMATCH');
      throw new TenantAccessViolationError(
        `SECURITY: Trial token belongs to different tenant`,
        context,
        'CRITICAL'
      );
    }

    if (data.status !== 'active') {
      await logAccessViolation(context, 'TRIAL_TOKEN_INACTIVE');
      throw new TenantAccessViolationError(
        'SECURITY: Trial token is not active',
        context,
        'MEDIUM'
      );
    }

    if (new Date(data.expires_at) < new Date()) {
      await logAccessViolation(context, 'TRIAL_TOKEN_EXPIRED');
      throw new TenantAccessViolationError(
        'SECURITY: Trial token has expired',
        context,
        'MEDIUM'
      );
    }

    logger.debug('Trial token ownership validated', {
      tenant_id_hash: hashTenantId(tenant_id),
      trial_token_hash: hashTenantId(trial_token),
    });
  } catch (error) {
    if (error instanceof TenantAccessViolationError) {
      throw error;
    }
    logger.error('Trial token validation error', { error, context });
    throw new TenantAccessViolationError(
      'SECURITY: Trial token validation failed',
      context,
      'CRITICAL'
    );
  }
}

/**
 * Log access violation to audit log and security monitoring
 */
async function logAccessViolation(
  context: TenantAccessContext,
  violation_type: string
): Promise<void> {
  const tenant_id = context.tenant_id || 'unknown';

  // Log to audit system
  await AuditLogger.logUnauthorizedAccess(tenant_id, violation_type, {
    operation: context.operation,
    resource_type: context.resource_type,
    resource_id: context.resource_id,
    ip_address: context.ip_address,
    user_agent: context.user_agent,
    timestamp: new Date().toISOString(),
  });

  // Log to application logger
  logger.error('Tenant access violation', {
    violation_type,
    tenant_id_hash: hashTenantId(tenant_id),
    context,
  });
}

/**
 * Hash tenant ID for logging (PII protection)
 */
function hashTenantId(tenant_id: string): string {
  return crypto.createHash('sha256').update(tenant_id).digest('hex').substring(0, 16);
}

/**
 * Middleware wrapper for Next.js API routes
 * Usage: export const POST = withTenantValidation(handler);
 */
export function withTenantValidation(
  handler: (request: Request, context: { params: any }) => Promise<Response>
) {
  return async (request: Request, context: { params: any }): Promise<Response> => {
    try {
      const body = await request.json();
      const tenant_id = body.tenant_id;

      if (!tenant_id) {
        return new Response(
          JSON.stringify({
            error: 'SECURITY: tenant_id is required',
            code: 'MISSING_TENANT_ID',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      await validateTenantAccess(tenant_id, {
        operation: 'api_request',
        ip_address: request.headers.get('x-forwarded-for') || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
      });

      // Call original handler
      return handler(request, context);
    } catch (error) {
      if (error instanceof TenantAccessViolationError) {
        return new Response(
          JSON.stringify({
            error: error.message,
            code: 'TENANT_ACCESS_VIOLATION',
            severity: error.severity,
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      logger.error('Unexpected error in tenant validation middleware', { error });
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}

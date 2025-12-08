/**
 * Tenant Plan Configuration API
 * GET: Fetch tenant plan configuration
 * PUT: Update tenant plan configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/jwt';
import { getPlanDetector } from '@/lib/plan-detector';
import { extractTenantId } from '../../../../middleware/tenant-utils';
import { checkTenantRateLimit } from '../../../../middleware/tenant-rate-limit';
import { z } from 'zod';
import { logger } from '../../../../lib/observability/logger';
import { trackUsage } from '@/lib/trial/usage-tracker';
import { ErrorAudit, auditLog } from '@/lib/trial/audit-logger';
import TrialLogger from '@/lib/trial/logger';
import type { PlanType, IndustryVertical, EcommercePlatform, CalendarIntegration, FeatureFlags } from '@/types/multi-plan';

export async function GET(request: any, context: { params: Promise<{}> }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = Date.now();
  let tenantId: string | undefined;
  let tracker: any | undefined;

  try {
    // Verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      await ErrorAudit.apiError(undefined, '/api/tenant/plan', 401, 'Missing or invalid authorization header', requestId);
      TrialLogger.logRequest('GET', '/api/tenant/plan', 401, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = await verifyJWT(token);
    if (!payload) {
      await ErrorAudit.apiError(undefined, '/api/tenant/plan', 401, 'Invalid or expired token', requestId);
      TrialLogger.logRequest('GET', '/api/tenant/plan', 401, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Consistent tenant extraction
    tenantId = payload?.tenantId ? String((payload as any).tenantId) : extractTenantId({ headers: request.headers });
    if (!tenantId) {
      await ErrorAudit.apiError(undefined, '/api/tenant/plan', 400, 'Missing tenantId', requestId);
      TrialLogger.logRequest('GET', '/api/tenant/plan', 400, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }

    // Usage tracker
    tracker = trackUsage(tenantId, 'api_call', { method: 'GET', endpoint: '/api/tenant/plan', requestId });

    // Per-tenant rate limiting (30 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 30, 60);
    if (!allowed) {
      await tracker.recordRateLimit();
      await ErrorAudit.apiError(tenantId, '/api/tenant/plan', 429, 'Rate limit exceeded', requestId);
      TrialLogger.logRequest('GET', '/api/tenant/plan', 429, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Get plan configuration
    const planDetector = getPlanDetector();
    const config = await planDetector.getTenantPlan(tenantId);

    if (!config) {
      await tracker.recordFailure(new Error('Tenant plan not found'), 404);
      await ErrorAudit.apiError(tenantId, '/api/tenant/plan', 404, 'Tenant plan not found', requestId);
      logger.info('Audit log', {
        action: 'tenant_plan_fetch_failed',
        tenantId,
        status: 'not_found',
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('GET', '/api/tenant/plan', 404, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Tenant plan not found' }, { status: 404 });
    }

    // Don't expose sensitive API keys
    const safeConfig = {
      id: config.id,
      plan_type: config.plan_type,
      industry_vertical: config.industry_vertical,
      ecommerce_platform: config.ecommerce_platform,
      calendar_integration: config.calendar_integration ? {
        provider: config.calendar_integration.provider,
        timezone: config.calendar_integration.timezone,
        booking_duration_minutes: config.calendar_integration.booking_duration_minutes,
        buffer_minutes: config.calendar_integration.buffer_minutes,
      } : undefined,
      feature_flags: config.feature_flags,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };

    await tracker.recordSuccess({ status_code: 200 });
    logger.info('Audit log', {
      action: 'tenant_plan_fetched',
      tenantId,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
    TrialLogger.logRequest('GET', '/api/tenant/plan', 200, Date.now() - startTime, { requestId, tenantId });
    return NextResponse.json(safeConfig);
  } catch (error) {
    logger.error('Error fetching tenant plan:', { message: (error as Error).message });
    try {
      await ErrorAudit.apiError(typeof tenantId === 'string' ? tenantId : undefined, '/api/tenant/plan', 500, (error as Error).message, requestId);
      if (tracker) await tracker.recordFailure(error, 500);
    } catch (auditErr) {
      // swallow audit errors
      console.error('Audit logging failed', auditErr);
    }
    logger.info('Audit log', {
      action: 'tenant_plan_fetch_failed',
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    TrialLogger.logRequest('GET', '/api/tenant/plan', 500, Date.now() - startTime, { requestId, tenantId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Zod schema for PUT input validation
const planUpdateSchema = z.object({
  plan_type: z.enum(['service', 'ecommerce']).optional(),
  industry_vertical: z.enum([
    'healthcare', 'legal', 'financial', 'technical', 'retail', 'hospitality', 'education', 'real_estate',
  ]).optional(),
  ecommerce_platform: z.enum(['shopify', 'woocommerce', 'bigcommerce', 'custom']).optional(),
  calendar_integration: z.any().optional(),
  feature_flags: z.any().optional(),
});

export async function PUT(request: any, context: { params: Promise<{}> }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = Date.now();
  let tenantId: string | undefined;
  let tracker: any | undefined;

  try {
    // Verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      await ErrorAudit.apiError(undefined, '/api/tenant/plan', 401, 'Missing or invalid authorization header', requestId);
      TrialLogger.logRequest('PUT', '/api/tenant/plan', 401, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = await verifyJWT(token);
    if (!payload) {
      await ErrorAudit.apiError(undefined, '/api/tenant/plan', 401, 'Invalid or expired token', requestId);
      TrialLogger.logRequest('PUT', '/api/tenant/plan', 401, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Consistent tenant extraction
    tenantId = payload?.tenantId ? String((payload as any).tenantId) : extractTenantId({ headers: request.headers });
    if (!tenantId) {
      await ErrorAudit.apiError(undefined, '/api/tenant/plan', 400, 'Missing tenantId', requestId);
      TrialLogger.logRequest('PUT', '/api/tenant/plan', 400, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }

    tracker = trackUsage(tenantId, 'api_call', { method: 'PUT', endpoint: '/api/tenant/plan', requestId });

    // Per-tenant rate limiting (10 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 10, 60);
    if (!allowed) {
      await tracker.recordRateLimit();
      await ErrorAudit.apiError(tenantId, '/api/tenant/plan', 429, 'Rate limit exceeded', requestId);
      TrialLogger.logRequest('PUT', '/api/tenant/plan', 429, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Parse and validate request body
    const body = await request.json();
    const result = planUpdateSchema.safeParse(body);
    if (!result.success) {
      const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
      logger.warn('Input validation failed', { issues });
      await tracker.recordFailure(new Error('Invalid input'), 422);
      await ErrorAudit.apiError(tenantId, '/api/tenant/plan', 422, 'Invalid input', requestId);
      logger.info('Audit log', {
        action: 'tenant_plan_update_failed',
        tenantId,
        status: 'invalid_input',
        error: issues,
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('PUT', '/api/tenant/plan', 422, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Invalid input', details: issues }, { status: 422 });
    }
    const updates = result.data;

    // Update tenant plan
    const planDetector = getPlanDetector();
    const success = await planDetector.updateTenantPlan(tenantId, updates);

    if (!success) {
      await tracker.recordFailure(new Error('Failed to update tenant plan'), 500);
      await ErrorAudit.apiError(tenantId, '/api/tenant/plan', 500, 'Failed to update tenant plan', requestId);
      logger.info('Audit log', {
        action: 'tenant_plan_update_failed',
        tenantId,
        status: 'update_failed',
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('PUT', '/api/tenant/plan', 500, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Failed to update tenant plan' }, { status: 500 });
    }

    // Fetch updated config
    const updatedConfig = await planDetector.getTenantPlan(tenantId);

    await tracker.recordSuccess({ status_code: 200 });
    await auditLog('tenant_plan_updated', {
      tenant_id: tenantId,
      event_type: 'tenant_plan_updated',
      entity_type: 'tenant_plan',
      entity_id: tenantId,
      action: 'update',
      actor_type: 'tenant',
      result: 'success',
      new_values: updates,
    });

    logger.info('Audit log', {
      action: 'tenant_plan_updated',
      tenantId,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
    TrialLogger.logRequest('PUT', '/api/tenant/plan', 200, Date.now() - startTime, { requestId, tenantId });
    return NextResponse.json({
      success: true,
      config: updatedConfig,
    });
  } catch (error) {
    logger.error('Error updating tenant plan:', { message: (error as Error).message });
    try {
      await ErrorAudit.apiError(typeof tenantId === 'string' ? tenantId : undefined, '/api/tenant/plan', 500, (error as Error).message, requestId);
      if (tracker) await tracker.recordFailure(error, 500);
    } catch (auditErr) {
      console.error('Audit logging failed', auditErr);
    }
    logger.info('Audit log', {
      action: 'tenant_plan_update_failed',
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    TrialLogger.logRequest('PUT', '/api/tenant/plan', 500, Date.now() - startTime, { requestId, tenantId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

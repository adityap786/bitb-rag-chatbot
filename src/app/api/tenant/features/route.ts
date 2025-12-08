/**
 * Feature Flags Management API
 * POST: Enable/disable specific features for a tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/jwt';
import { getPlanDetector } from '@/lib/plan-detector';
import { trackUsage } from '@/lib/trial/usage-tracker';
import { ErrorAudit } from '@/lib/trial/audit-logger';
import TrialLogger from '@/lib/trial/logger';
import { extractTenantId } from '../../../../middleware/tenant-utils';
import { checkTenantRateLimit } from '../../../../middleware/tenant-rate-limit';
import { z } from 'zod';
import { logger } from '../../../../lib/observability/logger';
import type { FeatureFlags } from '@/types/multi-plan';

// Zod schema for POST input validation
const featureFlagSchema = z.object({
  action: z.enum(['enable', 'disable']),
  features: z.array(z.string()).min(1),
});

export async function POST(request: any, context: { params: Promise<{}> }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = Date.now();
  let tracker: any;

  try {
    // Verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      await ErrorAudit.apiError(undefined, '/api/tenant/features', 401, 'Missing or invalid authorization header', requestId);
      TrialLogger.logRequest('POST', '/api/tenant/features', 401, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = await verifyJWT(token);
    if (!payload) {
      await ErrorAudit.apiError(undefined, '/api/tenant/features', 401, 'Invalid or expired token', requestId);
      TrialLogger.logRequest('POST', '/api/tenant/features', 401, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Consistent tenant extraction
    const tenantId = (payload.tenantId as string) || extractTenantId({ headers: request.headers });
    if (!tenantId) {
      await ErrorAudit.apiError(undefined, '/api/tenant/features', 400, 'Missing tenantId', requestId);
      TrialLogger.logRequest('POST', '/api/tenant/features', 400, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }

    // Usage tracker for this tenant/endpoint
    tracker = trackUsage(tenantId, 'api_call', { endpoint: '/api/tenant/features', method: 'POST', requestId });

    // Per-tenant rate limiting (10 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 10, 60);
    if (!allowed) {
      logger.info('Audit log', {
        action: 'feature_flag_update_failed',
        tenantId,
        status: 'rate_limited',
        timestamp: new Date().toISOString(),
      });
      if (tracker) await tracker.recordRateLimit();
      await ErrorAudit.apiError(tenantId, '/api/tenant/features', 429, 'Rate limit exceeded', requestId);
      TrialLogger.logRequest('POST', '/api/tenant/features', 429, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Parse and validate request body
    const body = await request.json();
    const result = featureFlagSchema.safeParse(body);
    if (!result.success) {
      const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
      logger.warn('Input validation failed', { issues });
      logger.info('Audit log', {
        action: 'feature_flag_update_failed',
        tenantId,
        status: 'invalid_input',
        error: issues,
        timestamp: new Date().toISOString(),
      });
      if (tracker) await tracker.recordFailure(new Error('Invalid input'), 422);
      await ErrorAudit.apiError(tenantId, '/api/tenant/features', 422, 'Invalid input', requestId);
      TrialLogger.logRequest('POST', '/api/tenant/features', 422, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Invalid input', details: issues }, { status: 422 });
    }
    const { action, features } = result.data;

    const planDetector = getPlanDetector();

    // Enable or disable features
    let success: boolean;
    if (action === 'enable') {
      success = await planDetector.enableFeatures(tenantId, features as (keyof FeatureFlags)[]);
    } else {
      success = await planDetector.disableFeatures(tenantId, features as (keyof FeatureFlags)[]);
    }

    if (!success) {
      logger.info('Audit log', {
        action: 'feature_flag_update_failed',
        tenantId,
        status: 'update_failed',
        timestamp: new Date().toISOString(),
      });
      if (tracker) await tracker.recordFailure(new Error('Update failed'), 500);
      await ErrorAudit.apiError(tenantId, '/api/tenant/features', 500, 'Failed to update feature flags', requestId);
      TrialLogger.logRequest('POST', '/api/tenant/features', 500, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Failed to update feature flags' }, { status: 500 });
    }

    // Get updated config
    const updatedConfig = await planDetector.getTenantPlan(tenantId);

    logger.info('Audit log', {
      action: 'feature_flag_updated',
      tenantId,
      status: 'success',
      timestamp: new Date().toISOString(),
    });

    if (tracker) await tracker.recordSuccess({ status_code: 200, metadata: { features } });
    TrialLogger.logRequest('POST', '/api/tenant/features', 200, Date.now() - startTime, { requestId, tenantId });

    return NextResponse.json({
      success: true,
      feature_flags: updatedConfig?.feature_flags || {},
    });
  } catch (error) {
    logger.error('Error updating feature flags:', { message: (error as Error).message });
    logger.info('Audit log', {
      action: 'feature_flag_update_failed',
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    await ErrorAudit.apiError(undefined, '/api/tenant/features', 500, (error as Error).message, requestId);
    if (tracker) await tracker.recordFailure(error as Error, 500);
    TrialLogger.logRequest('POST', '/api/tenant/features', 500, Date.now() - startTime, { requestId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: any, context: { params: Promise<{}> }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = Date.now();
  let tracker: any;

  try {
    // Verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      await ErrorAudit.apiError(undefined, '/api/tenant/features', 401, 'Missing or invalid authorization header', requestId);
      TrialLogger.logRequest('GET', '/api/tenant/features', 401, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = await verifyJWT(token);
    if (!payload) {
      await ErrorAudit.apiError(undefined, '/api/tenant/features', 401, 'Invalid or expired token', requestId);
      TrialLogger.logRequest('GET', '/api/tenant/features', 401, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Consistent tenant extraction
    const tenantId = (payload.tenantId as string) || extractTenantId({ headers: request.headers });
    if (!tenantId) {
      await ErrorAudit.apiError(undefined, '/api/tenant/features', 400, 'Missing tenantId', requestId);
      TrialLogger.logRequest('GET', '/api/tenant/features', 400, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }

    // Usage tracker for this tenant/endpoint
    tracker = trackUsage(tenantId, 'api_call', { endpoint: '/api/tenant/features', method: 'GET', requestId });

    // Per-tenant rate limiting (20 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 20, 60);
    if (!allowed) {
      logger.info('Audit log', {
        action: 'feature_flag_fetch_failed',
        tenantId,
        status: 'rate_limited',
        timestamp: new Date().toISOString(),
      });
      if (tracker) await tracker.recordRateLimit();
      await ErrorAudit.apiError(tenantId, '/api/tenant/features', 429, 'Rate limit exceeded', requestId);
      TrialLogger.logRequest('GET', '/api/tenant/features', 429, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Get feature flag to check from query params
    const { searchParams } = new URL(request.url);
    const feature = searchParams.get('feature');

    const planDetector = getPlanDetector();

    if (feature) {
      // Check specific feature
      const enabled = await planDetector.isFeatureEnabled(tenantId, feature as keyof FeatureFlags);
      logger.info('Audit log', {
        action: 'feature_flag_checked',
        tenantId,
        feature,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
      if (tracker) await tracker.recordSuccess({ status_code: 200, metadata: { feature } });
      TrialLogger.logRequest('GET', '/api/tenant/features', 200, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ feature, enabled });
    } else {
      // Get all feature flags
      const config = await planDetector.getTenantPlan(tenantId);
      logger.info('Audit log', {
        action: 'feature_flags_fetched',
        tenantId,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
      if (tracker) await tracker.recordSuccess({ status_code: 200 });
      TrialLogger.logRequest('GET', '/api/tenant/features', 200, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({
        feature_flags: config?.feature_flags || {},
      });
    }
  } catch (error) {
    logger.error('Error fetching feature flags:', { message: (error as Error).message });
    logger.info('Audit log', {
      action: 'feature_flag_fetch_failed',
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    await ErrorAudit.apiError(undefined, '/api/tenant/features', 500, (error as Error).message, requestId);
    if (tracker) await tracker.recordFailure(error as Error, 500);
    TrialLogger.logRequest('GET', '/api/tenant/features', 500, Date.now() - startTime, { requestId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

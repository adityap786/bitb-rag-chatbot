import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { buildCorsHeaders } from '@/lib/dynamic-cors';
import { tokenMintCounter, corsRejectionCounter, jwtFailureCounter } from '@/lib/monitoring/security-metrics';
import { trackUsage } from '@/lib/trial/usage-tracker';
import { ErrorAudit } from '@/lib/trial/audit-logger';
import TrialLogger from '@/lib/trial/logger';
import { extractTenantId } from '../../../middleware/tenant-utils';
import { checkTenantRateLimit } from '../../../middleware/tenant-rate-limit';
import { z } from 'zod';
import { logger } from '../../../lib/observability/logger';


const SERVER_SECRET = process.env.SERVER_SECRET;

/**
 * Preflight handler. We attempt to validate against the global allowed origins
 * (env or tenant_config defaults). Per-tenant preflight cannot be reliably
 * validated because preflight does not include the request body.
 */
export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) {
    return NextResponse.json({}, { status: 204 });
  }

  // Use global check (no tenantId) for preflight
  const cors = await buildCorsHeaders(req, undefined, {
    methods: 'POST, OPTIONS',
    allowHeaders: 'Content-Type, Authorization, X-Tenant-Id',
    credentials: true,
    maxAge: '600',
  });

  if (!cors.allowed) {
    corsRejectionCounter.inc({ tenant_id: 'global', origin: origin || 'unknown' });
    return NextResponse.json({ error: 'CORS origin not allowed' }, { status: 403 });
  }

  // Ensure methods/headers are present for preflight
  const headers = {
    ...cors.headers,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id',
  };

  return NextResponse.json({}, { status: 204, headers });
}

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = Date.now();
  let tracker: any | undefined;

  // Zod schema for input validation
  const mintTokenSchema = z.object({
    tenantId: z.string().regex(/^tn_[a-z0-9]{5,32}$/i),
  });
  try {
    const body = await req.json();
    const result = mintTokenSchema.safeParse(body);
    if (!result.success) {
      const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
      logger.warn('Input validation failed', { issues });
      logger.info('Audit log', {
        action: 'mint_token_failed',
        status: 'invalid_input',
        error: issues,
        timestamp: new Date().toISOString(),
      });
      jwtFailureCounter.inc({ tenant_id: body?.tenantId || 'unknown', reason: 'invalid_tenant_id' });
      await ErrorAudit.apiError(undefined, '/api/mint-token', 400, 'Invalid tenantId', requestId);
      TrialLogger.logRequest('POST', '/api/mint-token', 400, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Invalid tenantId', details: issues }, { status: 400 });
    }
    const { tenantId } = result.data;

    // Create usage tracker for this tenant
    tracker = trackUsage(tenantId, 'api_call', { method: 'POST', endpoint: '/api/mint-token', requestId });

    // Per-tenant rate limiting (10 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 10, 60);
    if (!allowed) {
      if (tracker) await tracker.recordRateLimit();
      tokenMintCounter.inc({ tenant_id: tenantId, status: 'rate_limited' });
      await ErrorAudit.apiError(tenantId, '/api/mint-token', 429, 'Rate limit exceeded', requestId);
      logger.info('Audit log', {
        action: 'mint_token_failed',
        tenantId,
        status: 'rate_limited',
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('POST', '/api/mint-token', 429, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Require API key header
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      if (tracker) await tracker.recordFailure(new Error('Missing API key'), 401);
      jwtFailureCounter.inc({ tenant_id: tenantId, reason: 'missing_api_key' });
      await ErrorAudit.apiError(tenantId, '/api/mint-token', 401, 'Missing X-API-Key header', requestId);
      logger.info('Audit log', {
        action: 'mint_token_failed',
        tenantId,
        status: 'missing_api_key',
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('POST', '/api/mint-token', 401, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 });
    }

    // Validate API key against Supabase tenant_config or env
    let validKey = false;
    let expectedKey = process.env[`TENANT_${tenantId}_API_KEY`] || null;
    if (!expectedKey) {
      // Try Supabase lookup
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { data, error } = await supabase
            .from('tenant_config')
            .select('api_key')
            .eq('tenant_id', tenantId)
            .single();
          if (!error && data && data.api_key) {
            expectedKey = data.api_key;
          }
        }
      } catch (err) {
        logger.error('[mint-token] Supabase API key lookup failed', { message: (err as Error).message });
      }
    }
    if (expectedKey && apiKey === expectedKey) {
      validKey = true;
    }
    if (!validKey) {
      if (tracker) await tracker.recordFailure(new Error('Invalid API key'), 401);
      jwtFailureCounter.inc({ tenant_id: tenantId, reason: 'invalid_api_key' });
      await ErrorAudit.apiError(tenantId, '/api/mint-token', 401, 'Invalid API key', requestId);
      logger.info('Audit log', {
        action: 'mint_token_failed',
        tenantId,
        status: 'invalid_api_key',
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('POST', '/api/mint-token', 401, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Enforce dynamic CORS per-tenant: server-to-server (no Origin) is allowed;
    // if Origin header present, it must match tenant's allowed origins.
    const cors = await buildCorsHeaders(req, tenantId, {
      methods: 'POST',
      allowHeaders: 'Content-Type, Authorization, X-Tenant-Id, X-API-Key',
      credentials: true,
    });

    if (!cors.allowed) {
      if (tracker) await tracker.recordFailure(new Error('CORS rejected'), 403);
      corsRejectionCounter.inc({ tenant_id: tenantId, origin: req.headers.get('origin') || 'unknown' });
      await ErrorAudit.apiError(tenantId, '/api/mint-token', 403, 'Origin not allowed', requestId);
      logger.info('Audit log', {
        action: 'mint_token_failed',
        tenantId,
        status: 'cors_rejected',
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('POST', '/api/mint-token', 403, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
    }

    if (!SERVER_SECRET || typeof SERVER_SECRET !== 'string' || SERVER_SECRET.length < 12) {
      if (tracker) await tracker.recordFailure(new Error('Server secret invalid'), 500);
      jwtFailureCounter.inc({ tenant_id: tenantId, reason: 'server_secret_invalid' });
      await ErrorAudit.apiError(tenantId, '/api/mint-token', 500, 'Server misconfiguration: SERVER_SECRET missing or too short', requestId);
      logger.info('Audit log', {
        action: 'mint_token_failed',
        tenantId,
        status: 'server_secret_invalid',
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('POST', '/api/mint-token', 500, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Server misconfiguration: SERVER_SECRET missing or too short' }, { status: 500 });
    }
    // Generate JTI (unique token ID)
    const jti = `${tenantId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const token = jwt.sign({ tenantId, jti }, SERVER_SECRET, { expiresIn: '5m' });
    tokenMintCounter.inc({ tenant_id: tenantId, status: 'success' });
    if (tracker) await tracker.recordSuccess({ status_code: 200 });
    logger.info('Audit log', {
      action: 'mint_token_success',
      tenantId,
      status: 'success',
      jti,
      timestamp: new Date().toISOString(),
    });
    TrialLogger.logRequest('POST', '/api/mint-token', 200, Date.now() - startTime, { requestId, tenantId, jti });
    return NextResponse.json({ token, expiresIn: 300, jti }, { headers: cors.headers });
  } catch (err: any) {
    jwtFailureCounter.inc({ tenant_id: 'unknown', reason: err?.message || 'mint_error' });
    logger.error('Error minting token:', { message: err?.message });
    try {
      if (tracker) await tracker.recordFailure(err, 500);
      await ErrorAudit.apiError(undefined, '/api/mint-token', 500, err?.message || 'mint_error', requestId);
    } catch (auditErr) {
      console.error('Audit logging failed', auditErr);
    }
    logger.info('Audit log', {
      action: 'mint_token_failed',
      status: 'error',
      error: err?.message,
      timestamp: new Date().toISOString(),
    });
    TrialLogger.logRequest('POST', '/api/mint-token', 500, Date.now() - startTime, { requestId });
    return NextResponse.json({ error: err?.message || 'Token mint error' }, { status: 500 });
  }
}

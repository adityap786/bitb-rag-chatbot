import { NextResponse } from 'next/server';
import { revokeJTI } from '@/lib/security/jti-revocation';
import { extractTenantId } from '../../../middleware/tenant-utils';
import { checkTenantRateLimit } from '../../../middleware/tenant-rate-limit';
import { z } from 'zod';
import { logger } from '../../../lib/observability/logger';
import { trackUsage } from '@/lib/trial/usage-tracker';
import { ErrorAudit } from '@/lib/trial/audit-logger';
import TrialLogger from '@/lib/trial/logger';

// Zod schema for input validation
const revokeTokenSchema = z.object({
  jti: z.string().min(8),
  tenantId: z.string().regex(/^tn_[a-z0-9]{5,32}$/i),
});

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = Date.now();
  let tracker: any | undefined;

  try {
    const body = await req.json();
    const result = revokeTokenSchema.safeParse(body);
    if (!result.success) {
      const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
      logger.warn('Input validation failed', { issues });
      logger.info('Audit log', {
        action: 'revoke_token_failed',
        status: 'invalid_input',
        error: issues,
        timestamp: new Date().toISOString(),
      });
      await ErrorAudit.apiError(undefined, '/api/revoke-token', 422, 'Invalid input', requestId);
      TrialLogger.logRequest('POST', '/api/revoke-token', 422, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Invalid input', details: issues }, { status: 422 });
    }
    const { jti, tenantId } = result.data;

    tracker = trackUsage(tenantId, 'api_call', { method: 'POST', endpoint: '/api/revoke-token', requestId });

    // Per-tenant rate limiting (10 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 10, 60);
    if (!allowed) {
      if (tracker) await tracker.recordRateLimit();
      await ErrorAudit.apiError(tenantId, '/api/revoke-token', 429, 'Rate limit exceeded', requestId);
      logger.info('Audit log', {
        action: 'revoke_token_failed',
        tenantId,
        status: 'rate_limited',
        timestamp: new Date().toISOString(),
      });
      TrialLogger.logRequest('POST', '/api/revoke-token', 429, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    await revokeJTI(jti);
    if (tracker) await tracker.recordSuccess({ status_code: 200 });
    logger.info('Audit log', {
      action: 'revoke_token_success',
      tenantId,
      jti,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
    TrialLogger.logRequest('POST', '/api/revoke-token', 200, Date.now() - startTime, { requestId, tenantId, jti });
    return NextResponse.json({ revoked: true });
  } catch (err: any) {
    logger.error('Error revoking token:', { message: err?.message });
    try {
      if (tracker) await tracker.recordFailure(err, 500);
      await ErrorAudit.apiError(undefined, '/api/revoke-token', 500, err?.message || 'revoke_error', requestId);
    } catch (auditErr) {
      console.error('Audit logging failed', auditErr);
    }
    logger.info('Audit log', {
      action: 'revoke_token_failed',
      status: 'error',
      error: err?.message,
      timestamp: new Date().toISOString(),
    });
    TrialLogger.logRequest('POST', '/api/revoke-token', 500, Date.now() - startTime, { requestId });
    return NextResponse.json({ error: err?.message || 'Revoke error' }, { status: 500 });
  }
}

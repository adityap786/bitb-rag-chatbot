import { NextRequest, NextResponse } from 'next/server';
import type { SessionInitRequest, SessionInitResponse } from '@/types/trial';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { trackUsage } from '@/lib/trial/usage-tracker';
import { ChatAudit, ErrorAudit, TrialAudit } from '@/lib/trial/audit-logger';
import { checkTenantRateLimit } from '../../../../middleware/tenant-rate-limit';
import { z } from 'zod';
import { logger } from '../../../../lib/observability/logger';
import { randomUUID } from 'crypto';

const supabase = createLazyServiceClient();

// Zod schema for input validation
const sessionInitSchema = z.object({
  // Enforce production tenant format: tn_ + 32 lowercase hex chars
  tenantId: z.string().regex(/^tn_[a-f0-9]{32}$/),
  visitorId: z.string().min(6),
  referrer: z.string().optional(),
});

export async function POST(req: any, context: { params: Promise<{}> }) {
  const requestId = req.headers.get('x-request-id') || randomUUID();
  const startTime = Date.now();
  let tracker: any;

  try {
    const body: SessionInitRequest = await req.json();
    const result = sessionInitSchema.safeParse(body);
    if (!result.success) {
      const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
      logger.warn('Input validation failed', { issues });
      logger.info('Audit log', {
        action: 'session_init_failed',
        status: 'invalid_input',
        error: issues,
        timestamp: new Date().toISOString(),
      });
      await ErrorAudit.apiError(undefined, '/api/widget/session', 422, 'Invalid input', requestId);
      return NextResponse.json({ error: 'Invalid input', details: issues }, { status: 422 });
    }
    const { tenantId, visitorId, referrer } = result.data;

    // Usage tracker for this tenant/endpoint
    tracker = trackUsage(tenantId, 'api_call', { endpoint: '/api/widget/session', method: 'POST' });

    // Per-tenant rate limiting (20 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 20, 60);
    if (!allowed) {
      logger.info('Audit log', {
        action: 'session_init_failed',
        tenantId,
        status: 'rate_limited',
        timestamp: new Date().toISOString(),
      });
      if (tracker) await tracker.recordRateLimit();
      await ErrorAudit.apiError(tenantId, '/api/widget/session', 429, 'Rate limit exceeded', requestId);
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Verify tenant exists and is active
    const { data: tenant } = await supabase
      .from('tenants')
      .select('status, expires_at')
      .eq('tenant_id', tenantId)
      .single();

    if (!tenant) {
      logger.info('Audit log', {
        action: 'session_init_failed',
        tenantId,
        status: 'tenant_not_found',
        timestamp: new Date().toISOString(),
      });
      await ErrorAudit.apiError(tenantId, '/api/widget/session', 404, 'Tenant not found', requestId);
      if (tracker) await tracker.recordFailure(new Error('Tenant not found'), 404);
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (tenant.status !== 'active') {
      logger.info('Audit log', {
        action: 'session_init_failed',
        tenantId,
        status: 'trial_inactive',
        timestamp: new Date().toISOString(),
      });
      await ErrorAudit.apiError(tenantId, '/api/widget/session', 403, 'Trial inactive', requestId);
      if (tracker) await tracker.recordFailure(new Error('Trial inactive'), 403);
      return NextResponse.json({ error: 'Trial has expired or is inactive' }, { status: 403 });
    }

    // Check if trial has expired
    const now = new Date();
    const expiresAt = new Date(tenant.expires_at);
    if (now > expiresAt) {
      // Update tenant status
      await supabase
        .from('tenants')
        .update({ status: 'expired' })
        .eq('tenant_id', tenantId);

      logger.info('Audit log', {
        action: 'session_init_failed',
        tenantId,
        status: 'trial_expired',
        timestamp: new Date().toISOString(),
      });
      // Audit the expiry and record failure
      await TrialAudit.expired(tenantId);
      await ErrorAudit.apiError(tenantId, '/api/widget/session', 403, 'Trial expired', requestId);
      if (tracker) await tracker.recordFailure(new Error('Trial expired'), 403);
      return NextResponse.json({ error: 'Trial has expired' }, { status: 403 });
    }

    // Check for existing active session
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('session_id, expires_at')
      .eq('tenant_id', tenantId)
      .eq('visitor_id', visitorId)
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSession) {
      // Extend existing session
      await supabase
        .from('chat_sessions')
        .update({
          last_activity: now.toISOString(),
          expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(), // 30 min from now
        })
        .eq('session_id', existingSession.session_id);

      const response: SessionInitResponse = {
        sessionId: existingSession.session_id,
      };

      // Record success and add a session-extended audit entry
      if (tracker) await tracker.recordSuccess({ status_code: 200, metadata: { session_id: existingSession.session_id } });
      logger.info('Audit log', {
        action: 'session_init_success',
        tenantId,
        sessionId: existingSession.session_id,
        status: 'existing_session_extended',
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(response);
    }

    // Create new session
    const { data: newSession, error } = await supabase
      .from('chat_sessions')
      .insert({
        tenant_id: tenantId,
        visitor_id: visitorId,
        metadata: {
          referrer: referrer || '',
          user_agent: req.headers.get('user-agent') || '',
        },
      })
      .select()
      .single();

    if (error || !newSession) {
      logger.error('Failed to create session:', { message: error?.message });
      logger.info('Audit log', {
        action: 'session_init_failed',
        tenantId,
        status: 'create_session_failed',
        error: error?.message,
        timestamp: new Date().toISOString(),
      });
      await ErrorAudit.apiError(tenantId, '/api/widget/session', 500, error?.message || 'Failed to create session', requestId);
      if (tracker) await tracker.recordFailure(new Error(error?.message || 'Failed to create session'), 500);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    const response: SessionInitResponse = {
      sessionId: newSession.session_id,
    };

    // Audit and usage tracking for new session
    await ChatAudit.sessionCreated(tenantId, newSession.session_id, visitorId);
    if (tracker) await tracker.recordSuccess({ status_code: 201, metadata: { session_id: newSession.session_id } });

    logger.info('Audit log', {
      action: 'session_init_success',
      tenantId,
      sessionId: newSession.session_id,
      status: 'new_session_created',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    logger.error('Session init error:', { message: (error as Error).message });
    logger.info('Audit log', {
      action: 'session_init_failed',
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    await ErrorAudit.apiError(undefined, '/api/widget/session', 500, (error as Error).message, requestId);
    if (tracker) await tracker.recordFailure(error as Error, 500);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

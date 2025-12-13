import { NextRequest, NextResponse } from 'next/server';
import { sign } from 'jsonwebtoken';
import type { TrialStartRequest, TrialStartResponse } from '@/types/trial';
import { validateEmail, validateBusinessName, validateBusinessType } from '@/lib/trial/validation';
import { ValidationError, ConflictError, NotFoundError, InternalError } from '@/lib/trial/errors';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

const JWT_SECRET = process.env.JWT_SECRET;

export async function POST(req: any, context: { params: Promise<{}> }) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Debug: Log environment check
  console.log('[trial/start] Environment check:', {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL || !!process.env.SUPABASE_URL,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasJwtSecret: !!process.env.JWT_SECRET,
  });

  try {
    // Rate limiting (Redis-backed via shared middleware)
    const ipRateLimitResponse = await rateLimit(req, RATE_LIMITS.trialStart);
    if (ipRateLimitResponse) return ipRateLimitResponse;

    const body = await req.json();

    // Validate inputs
    validateEmail(body.email);
    validateBusinessName(body.businessName);
    validateBusinessType(body.businessType);

    // Check if email already exists with active trial
    const { data: existing, error: existingError } = await supabase
      .from('tenants')
      .select('tenant_id, status')
      .eq('email', body.email)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      // PGRST116 means no row found, which is expected
      console.error('[trial/start] Supabase error checking existing trial:', {
        code: existingError.code,
        message: existingError.message,
        details: existingError.details,
        hint: existingError.hint,
      });
      throw new InternalError(`Failed to check existing trial: ${existingError.message}`, new Error(existingError.message));
    }

    if (existing && existing.status === 'active') {
      throw new ConflictError('An active trial already exists for this email');
    }

    // Generate tenant_id in the correct format: tn_<32 hex chars>
    const tenantId = `tn_${crypto.randomUUID().replace(/-/g, '')}`;

    // Create new trial tenant
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 3);

    const { data: tenant, error: insertError } = await supabase
      .from('tenants')
      .insert({
        tenant_id: tenantId,
        email: body.email,
        name: body.businessName,
        status: 'active',
        plan: 'trial',
        plan_type: body.businessType === 'ecommerce' ? 'ecommerce' : 'service',
        expires_at: trialExpiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError || !tenant) {
      console.error('[trial/start] Insert error:', insertError);
      throw new InternalError('Failed to create trial tenant', new Error(insertError?.message || 'Unknown'));
    }

    // Generate setup token (JWT valid for 24 hours)
    if (!JWT_SECRET) {
      // Log a clear server-configuration error and surface a 500 via InternalError
      TrialLogger.error('JWT_SECRET environment variable is not set; cannot generate setup token', {
        requestId,
        tenantId: tenant?.tenant_id,
      });
      throw new InternalError('Server configuration error: JWT signing secret is not configured');
    }

    const setupToken = sign(
      {
        tenantId: tenant.tenant_id,
        email: tenant.email,
        type: 'setup',
      },
      JWT_SECRET as string,
      { expiresIn: '24h', algorithm: 'HS256' }
    );

    // Store setup token in metadata (tenants table doesn't have setup_token column)
    const { error: updateError } = await supabase
      .from('tenants')
      .update({ metadata: { setup_token: setupToken } })
      .eq('tenant_id', tenant.tenant_id);

    if (updateError) {
      TrialLogger.warn('Failed to store setup token', {
        requestId,
        tenantId: tenant.tenant_id,
        error: updateError.message,
      });
    }

    const response: TrialStartResponse = {
      tenantId: tenant.tenant_id,
      trialExpiresAt: tenant.expires_at,
      setupToken,
    };

    TrialLogger.logTrialEvent('created', tenant.tenant_id, {
      requestId,
      email: body.email,
      businessType: body.businessType,
    });

    TrialLogger.logRequest('POST', '/api/trial/start', 201, Date.now() - startTime, { requestId });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof ValidationError) {
      TrialLogger.logRequest('POST', '/api/trial/start', error.statusCode, duration, { requestId });
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    if (error instanceof ConflictError) {
      TrialLogger.logRequest('POST', '/api/trial/start', 409, duration, { requestId });
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    if (error instanceof InternalError) {
      TrialLogger.error(error.message, error, { requestId });
      TrialLogger.logRequest('POST', '/api/trial/start', 500, duration, { requestId });
      return NextResponse.json(
        { error: 'Failed to create trial account. Please try again.' },
        { status: 500 }
      );
    }

    TrialLogger.error('Unexpected error in trial start', error as Error, { requestId });
    TrialLogger.logRequest('POST', '/api/trial/start', 500, duration, { requestId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

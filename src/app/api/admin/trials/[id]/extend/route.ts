import { NextRequest, NextResponse } from 'next/server';
import { ValidationError, NotFoundError, InternalError, AuthorizationError } from '@/lib/trial/errors';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

function requireAdmin(req: NextRequest): void {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new AuthorizationError('Admin authorization required');
  }
  // TODO: Verify user is admin
}

export async function POST(
  req: any,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Require admin auth
    try {
      requireAdmin(req);
    } catch (err: any) {
      TrialLogger.warn('Unauthorized admin extend attempt', { requestId, tenantId: params.id });
      TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/extend`, 403, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const tenantId = params.id;

    // Validate days parameter
    if (!body.days || !Number.isInteger(body.days) || body.days <= 0 || body.days > 365) {
      throw new ValidationError('days must be an integer between 1 and 365');
    }

    // Get current trial
    const { data: tenant, error: fetchError } = await supabase
      .from('tenants')
      .select('expires_at, status')
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !tenant) {
      throw new NotFoundError('Trial');
    }

    // Calculate new expiration date
    const currentExpiry = new Date(tenant.expires_at);
    const now = new Date();
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(baseDate.getTime() + body.days * 24 * 60 * 60 * 1000);

    // Update tenant
    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        expires_at: newExpiry.toISOString(),
        status: 'active',
      })
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalError('Failed to extend trial', new Error(updateError.message));
    }

    TrialLogger.logTrialEvent('extended', tenantId, {
      requestId,
      daysAdded: body.days,
      newExpiresAt: newExpiry.toISOString(),
    });
    TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/extend`, 200, Date.now() - startTime, {
      requestId,
      tenantId,
    });

    // TODO: Send email notification to user

    return NextResponse.json({
      success: true,
      newExpiresAt: newExpiry.toISOString(),
      message: `Trial extended by ${body.days} days`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof ValidationError) {
      TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/extend`, 400, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof NotFoundError) {
      TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/extend`, 404, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof InternalError) {
      TrialLogger.error(error.message, error, { requestId });
      TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/extend`, 500, duration, { requestId });
      return NextResponse.json(
        { error: 'Failed to extend trial' },
        { status: 500 }
      );
    }

    TrialLogger.error('Unexpected error in trial extend', error as Error, { requestId });
    TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/extend`, 500, duration, { requestId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { ValidationError, NotFoundError, InternalError, AuthorizationError } from '@/lib/trial/errors';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { requireAdmin } from '@/lib/auth/admin-middleware';

const supabase = createLazyServiceClient();

const VALID_PLANS = ['potential', 'scale'] as const;

// Use centralized admin middleware for RBAC enforcement

export async function POST(
  req: any,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Require admin auth
    const adminAuthErr = await requireAdmin(req);
    if (adminAuthErr) {
      TrialLogger.warn('Unauthorized admin upgrade attempt', { requestId, tenantId: params.id });
      TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/upgrade`, 403, Date.now() - startTime, { requestId });
      return adminAuthErr;
    }

    const body = await req.json();
    const tenantId = params.id;

    // Validate plan parameter
    if (!body.plan || !VALID_PLANS.includes(body.plan)) {
      throw new ValidationError(`Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}`);
    }

    // Check tenant exists
    const { data: tenant, error: fetchError } = await supabase
      .from('trial_tenants')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !tenant) {
      throw new NotFoundError('Trial');
    }

    // Verify not already upgraded
    if (tenant.status === 'upgraded') {
      throw new ValidationError('Trial is already upgraded to a paid plan');
    }

    // Update tenant to upgraded status
    const { error: updateError } = await supabase
      .from('trial_tenants')
      .update({
        status: 'upgraded',
        plan_upgraded_to: body.plan,
      })
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalError('Failed to upgrade trial', new Error(updateError.message));
    }

    TrialLogger.logTrialEvent('upgraded', tenantId, {
      requestId,
      plan: body.plan,
    });
    TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/upgrade`, 200, Date.now() - startTime, {
      requestId,
      tenantId,
      plan: body.plan,
    });

    // TODO: Create Stripe subscription
    // TODO: Send welcome email with upgrade confirmation
    // TODO: Unlock paid features based on plan

    return NextResponse.json({
      success: true,
      plan: body.plan,
      message: `Trial upgraded to ${body.plan} plan`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof ValidationError) {
      TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/upgrade`, 400, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof NotFoundError) {
      TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/upgrade`, 404, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof InternalError) {
      TrialLogger.error(error.message, error, { requestId });
      TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/upgrade`, 500, duration, { requestId });
      return NextResponse.json(
        { error: 'Failed to upgrade trial' },
        { status: 500 }
      );
    }

    TrialLogger.error('Unexpected error in trial upgrade', error as Error, { requestId });
    TrialLogger.logRequest('POST', `/api/admin/trials/${params.id}/upgrade`, 500, duration, { requestId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

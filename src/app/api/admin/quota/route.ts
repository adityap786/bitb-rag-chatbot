import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { extractTenantId } from '../../../../middleware/tenant-utils';
import { checkTenantRateLimit } from '../../../../middleware/tenant-rate-limit';
import { z } from 'zod';
import { logger } from '../../../../lib/observability/logger';

const supabase = createLazyServiceClient();

// Zod schema for POST input validation
const quotaUpdateSchema = z.object({
  tenantId: z.string().regex(/^tn_[a-z0-9]{5,32}$/i),
  tokens: z.number().min(0),
});

// GET: View tenant quota
export async function GET(req: any, context: { params: Promise<{}> }) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId');
    if (!tenantId) {
      logger.warn('Missing tenantId in GET');
      return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    }
    // Per-tenant rate limiting (20 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 20, 60);
    if (!allowed) {
      logger.info('Audit log', {
        action: 'quota_get_failed',
        tenantId,
        status: 'rate_limited',
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    const { data, error } = await supabase.from('tenant_quotas').select('*').eq('tenant_id', tenantId).single();
    if (error) {
      logger.error('Error fetching quota:', { message: error.message });
      logger.info('Audit log', {
        action: 'quota_get_failed',
        tenantId,
        status: 'db_error',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    logger.info('Audit log', {
      action: 'quota_get_success',
      tenantId,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ quota: data });
  } catch (error) {
    logger.error('Internal error in GET quota:', { message: (error as Error).message });
    logger.info('Audit log', {
      action: 'quota_get_failed',
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Update tenant quota
export async function POST(req: any, context: { params: Promise<{}> }) {
  try {
    const body = await req.json();
    const result = quotaUpdateSchema.safeParse(body);
    if (!result.success) {
      logger.warn('Input validation failed', { errors: result.error.issues });
      logger.info('Audit log', {
        action: 'quota_update_failed',
        status: 'invalid_input',
        error: result.error.issues,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 422 });
    }
    const { tenantId, tokens } = result.data;
    // Per-tenant rate limiting (10 req/min)
    const allowed = await checkTenantRateLimit(tenantId, 10, 60);
    if (!allowed) {
      logger.info('Audit log', {
        action: 'quota_update_failed',
        tenantId,
        status: 'rate_limited',
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    const { error } = await supabase.from('tenant_quotas').upsert({ tenant_id: tenantId, tokens });
    if (error) {
      logger.error('Error updating quota:', { message: error.message });
      logger.info('Audit log', {
        action: 'quota_update_failed',
        tenantId,
        status: 'db_error',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    logger.info('Audit log', {
      action: 'quota_update_success',
      tenantId,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Internal error in POST quota:', { message: (error as Error).message });
    logger.info('Audit log', {
      action: 'quota_update_failed',
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

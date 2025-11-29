import { checkTenantRateLimit } from '../../../middleware/tenant-rate-limit';
/**
 * BiTB Ingestion API Route
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractTenantId } from '../../../middleware/tenant-utils';
import { z } from 'zod';
import { logger } from '../../../lib/observability/logger';
// Zod schema for input validation
const ingestSchema = z.object({
  tenant_id: z.string().min(1),
  trial_token: z.string().min(1),
  data_source: z.object({
    type: z.enum(['manual', 'upload', 'crawl']),
    text: z.string().optional(),
    files: z.array(z.object({
      name: z.string(),
      content_base64: z.string(),
      size: z.number().max(10 * 1024 * 1024)
    })).optional(),
    urls: z.array(z.string().url()).optional(),
    crawl_depth: z.number().min(1).max(3).optional()
  })
});
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { queueIngestionJob } from '../../../lib/queues/ingestQueue';

export async function POST(request: any, context: { params: Promise<{}> }) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    const body = await request.json();

    // Input validation
    const result = ingestSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.issues;
      logger.warn('Input validation failed', { errors: errorDetails });
      return NextResponse.json({ error: 'Invalid input', details: errorDetails }, { status: 422 });
    }

    const tenant_id = extractTenantId({ headers: request.headers, body })!;
    const { trial_token, data_source } = body;

    // Per-tenant rate limiting (20 req/min)
    const allowed = await checkTenantRateLimit(tenant_id, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    if (!['manual', 'upload', 'crawl'].includes(data_source.type)) {
      return NextResponse.json({ error: 'Invalid data source type' }, { status: 400 });
    }
    if (data_source.type === 'manual' && (!data_source.text || typeof data_source.text !== 'string')) {
      return NextResponse.json({ error: 'Text is required for manual data source' }, { status: 400 });
    }
    if (data_source.type === 'upload') {
      if (!data_source.files || !Array.isArray(data_source.files) || data_source.files.length === 0) {
        return NextResponse.json({ error: 'Files are required for upload data source' }, { status: 400 });
      }
      if (data_source.files.length > 5) {
        return NextResponse.json({ error: 'Maximum 5 files allowed' }, { status: 400 });
      }
      for (const file of data_source.files) {
        if (!file.name || !file.content_base64 || file.size > 10 * 1024 * 1024) {
          return NextResponse.json({ error: 'Invalid file: must be PDF, DOCX, TXT, HTML and <= 10MB' }, { status: 400 });
        }
      }
    }
    if (data_source.type === 'crawl') {
      if (!data_source.urls || !Array.isArray(data_source.urls) || data_source.urls.length === 0) {
        return NextResponse.json({ error: 'URLs are required for crawl data source' }, { status: 400 });
      }
      if (data_source.crawl_depth && (data_source.crawl_depth < 1 || data_source.crawl_depth > 3)) {
        return NextResponse.json({ error: 'Crawl depth must be between 1 and 3' }, { status: 400 });
      }
    }

    // Generate job ID
    const job_id = 'job_' + randomBytes(16).toString('hex');
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.rpc('set_tenant_context', { p_tenant_id: tenant_id });


    // Insert job record
    const jobRecord = {
      job_id,
      tenant_id,
      trial_token,
      data_source,
      status: 'queued',
      progress: 0,
      pages_processed: 0,
      total_pages: 0,
      chunks_created: 0,
      error: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      index_path: null
    };
    const { error: insertError } = await supabase
      .from('ingestion_jobs')
      .insert(jobRecord);
    if (insertError) {
      logger.error('Supabase insert error:', { message: insertError.message, details: insertError });
      logger.info('Audit log', {
        action: 'ingest_job_create_failed',
        tenantId: tenant_id,
        status: 'error',
        error: insertError.message,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: 'Failed to save job to database' },
        { status: 500 }
      );
    }

    // Audit log for successful job creation
    logger.info('Audit log', {
      action: 'ingest_job_created',
      tenantId: tenant_id,
      status: 'queued',
      jobId: job_id,
      timestamp: new Date().toISOString(),
    });

    // Queue job for worker
    await queueIngestionJob({ job_id, tenant_id, trial_token, data_source });

    // Estimate time based on data source
    let estimated_time_minutes = 3;
    if (data_source.type === 'crawl') {
      const depth = data_source.crawl_depth || 2;
      estimated_time_minutes = depth * 2 + (data_source.urls.length || 1);
    } else if (data_source.type === 'upload') {
      estimated_time_minutes = Math.ceil(data_source.files.length / 2);
    } else if (data_source.type === 'manual') {
      estimated_time_minutes = 1;
    }

    return NextResponse.json({
      job_id,
      status: 'queued',
      estimated_time_minutes,
      message: 'Ingestion job queued successfully'
    });
  } catch (error) {
    console.error('Ingestion Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

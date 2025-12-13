import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import type { ManualKBRequest } from '@/types/trial';
import { createHash } from 'crypto';
import {
  validateCompanyInfo,
  validateFAQs,
  sanitizeText,
} from '@/lib/trial/validation';
import {
  AuthenticationError,
  ValidationError,
  NotFoundError,
  InternalError,
} from '@/lib/trial/errors';
import { verifyBearerToken } from '@/lib/trial/auth';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { startTenantPipeline } from '@/lib/trial/start-pipeline';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

const supabase = createLazyServiceClient();

const MAX_COMPANY_INFO_LENGTH = 10000;

export async function POST(req: any, context: { params: Promise<{}> }) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Cheap IP/user rate limiting before auth/DB work
    const ipRateLimitResponse = await rateLimit(req, RATE_LIMITS.trial);
    if (ipRateLimitResponse) return ipRateLimitResponse;

    // Verify authentication
    let token;
    try {
      token = verifyBearerToken(req);
    } catch (err: any) {
      TrialLogger.logAuth('failure', undefined, { requestId, error: err.message });
      TrialLogger.logRequest('POST', '/api/trial/kb/manual', err.statusCode || 401, Date.now() - startTime, {
        requestId,
      });
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode || 401 }
      );
    }

    const { tenantId } = token;
    const body = await req.json();

    // Validate input
    try {
      validateCompanyInfo(body.companyInfo, MAX_COMPANY_INFO_LENGTH);
      if (body.faqs && body.faqs.length > 0) {
        validateFAQs(body.faqs);
      }
    } catch (err: any) {
      if (err instanceof ValidationError) {
        TrialLogger.logRequest('POST', '/api/trial/kb/manual', 400, Date.now() - startTime, {
          requestId,
          tenantId,
        });
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // Check tenant exists and is active
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('status')
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new NotFoundError('Tenant');
    }

    if (tenant.status !== 'active') {
      TrialLogger.warn('Attempting to add KB to inactive trial', { requestId, tenantId });
      throw new ValidationError('Trial is not active');
    }

    // Sanitize and combine company info and FAQs into knowledge base text
    const sanitizedCompanyInfo = sanitizeText(body.companyInfo.trim());
    let rawText = `Company Information:\n\n${sanitizedCompanyInfo}`;

    if (body.faqs && body.faqs.length > 0) {
      rawText += '\n\nFrequently Asked Questions:\n\n';
      body.faqs.forEach((faq: any, index: number) => {
        const sanitizedQ = sanitizeText(faq.question.trim());
        const sanitizedA = sanitizeText(faq.answer.trim());
        rawText += `Q${index + 1}: ${sanitizedQ}\nA${index + 1}: ${sanitizedA}\n\n`;
      });
    }

    // Compute content hash for deduplication
    const contentHash = createHash('sha256').update(rawText).digest('hex');

    // Check if already exists
    const { data: existing, error: checkError } = await supabase
      .from('knowledge_base')
      .select('kb_id')
      .eq('tenant_id', tenantId)
      .eq('content_hash', contentHash)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw new InternalError('Failed to check knowledge base', new Error(checkError.message));
    }

    if (existing) {
      TrialLogger.info('Duplicate KB entry detected', { requestId, tenantId, kbId: existing.kb_id });
      TrialLogger.logRequest('POST', '/api/trial/kb/manual', 200, Date.now() - startTime, {
        requestId,
        tenantId,
      });
      return NextResponse.json({
        kbId: existing.kb_id,
        status: 'completed',
        message: 'This content already exists in the knowledge base',
      });
    }

    // Insert into knowledge base
    const { data: kb, error: insertError } = await supabase
      .from('knowledge_base')
      .insert({
        tenant_id: tenantId,
        source_type: 'manual',
        content_hash: contentHash,
        raw_text: rawText,
        metadata: {
          companyInfoLength: body.companyInfo.length,
          faqCount: body.faqs?.length || 0,
        },
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !kb) {
      TrialLogger.error('Failed to insert manual KB into database', new Error(insertError?.message || 'Unknown'), { requestId, tenantId, insertError: insertError?.message });
      throw new InternalError('Failed to insert manual KB', new Error(insertError?.message || 'Unknown'));
    }

    TrialLogger.logModification('knowledge_base', 'create', kb.kb_id, tenantId, {
      requestId,
      sourceType: 'manual',
      faqCount: body.faqs?.length || 0,
    });

    // Start pipeline immediately after KB submission to reduce perceived latency
    let pipelineJobId: string | null = null;
    let pipelineStatus: string | null = null;
    try {
      const pipeline = await startTenantPipeline(tenantId, {
        source: 'manual',
        skipIfProcessing: true, // Don't restart if already running
      });
      pipelineJobId = pipeline.jobId;
      pipelineStatus = pipeline.status;
    } catch (err) {
      // Non-fatal: frontend can poll status
      TrialLogger.warn('Failed to auto-start pipeline after KB', { requestId, tenantId, error: (err as Error).message });
    }

    TrialLogger.logRequest('POST', '/api/trial/kb/manual', 201, Date.now() - startTime, {
      requestId,
      tenantId,
    });

    return NextResponse.json({
      kbId: kb.kb_id,
      status: 'queued',
      message: 'Knowledge base entry created successfully',
      pipelineJobId,
      pipelineStatus,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AuthenticationError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/manual', error.statusCode, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof ValidationError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/manual', error.statusCode, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof NotFoundError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/manual', 404, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof InternalError) {
      TrialLogger.error(error.message, error, { requestId });
      TrialLogger.logRequest('POST', '/api/trial/kb/manual', 500, duration, { requestId });
      return NextResponse.json(
        { error: 'Failed to save knowledge base' },
        { status: 500 }
      );
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    TrialLogger.error('Unexpected error in manual KB', error as Error, { requestId, errorMsg, errorType: typeof error });
    TrialLogger.logRequest('POST', '/api/trial/kb/manual', 500, duration, { requestId, error: errorMsg });
    return NextResponse.json(
      { error: 'Failed to save knowledge base. Please try again or contact support.' },
      { status: 500 }
    );
  }
}

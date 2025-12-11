import { NextRequest, NextResponse } from 'next/server';
import type { BatchChatRequest, BatchChatResponse, ChatMessage } from '@/types/chatbot';
import { z } from 'zod';
import { trackUsage } from '@/lib/trial/usage-tracker';
import { verifyToken } from '@/lib/trial/auth';
import { enforceQuota } from '@/lib/trial/quota-enforcer';
import { ChatAudit, ErrorAudit } from '@/lib/trial/audit-logger';
import { detectAndMaskPHI } from '@/lib/healthcare/compliance';
import { getLegalDisclaimer, analyzeDocument } from '@/lib/legal/compliance';
import { checkTenantRateLimit } from '../../../../middleware/tenant-rate-limit';
import { logger } from '../../../../lib/observability/logger';
// Utility to mask PII (simple email/phone masking)
function maskPII(str: string): string {
  if (!str) return str;
  // Mask emails
  str = str.replace(/([\w.%+-]+)@([\w.-]+)\.([a-zA-Z]{2,})/g, '***@***.***');
  // Mask phone numbers
  str = str.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '***-***-****');
  return str;
}
import { createLazyServiceClient } from '@/lib/supabase-client';
import TrialLogger from '@/lib/trial/logger';
import type { McpHybridRagResult } from '@/lib/ragPipeline';

const supabase = createLazyServiceClient();

import { getLLM } from '@/lib/llm/factory';
import { generateText } from 'ai';
import { validateTenantId } from '@/lib/security/rag-guardrails';

async function generateChatResponse(
  prompt: string,
  context: string,
  tenantId: string
): Promise<string> {
  // Get widget config for prompt template
  const { data: config } = await supabase
    .from('widget_configs')
    .select('prompt_template, chat_tone')
    .eq('tenant_id', tenantId)
    .single();

  const systemPrompt = config?.prompt_template || 'You are a helpful AI assistant.';

  // Use Groq via AI SDK
  const model = getLLM(tenantId);
  
  const { text } = await generateText({
    model,
    system: systemPrompt,
    messages: [
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${prompt}` },
    ],
    temperature: 0.7,
    maxTokens: 500,
  });

  return text;
}

export async function POST(req: any, context: { params: Promise<{}> }) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const startTime = Date.now();
  // Monitoring: import and prepare metrics
  const { recordApiCall, incrementMetric, observeLatency } = await import('@/lib/monitoring');
  const { recordChatApiMetrics } = await import('@/lib/monitoring/metrics');
  // Tenant / tracker (declared here so catch block can access)
  let tenantId: string | undefined = undefined;
  let tracker: any | undefined;

  // Check for streaming parameter
  const url = new URL(req.url);
  const streamParam = url.searchParams.get('stream');
  const isStream = streamParam === 'true';

  // Zod schema for request validation
  const ChatRequestSchema = z.object({
    sessionId: z.string().min(8),
    message: z.string().optional(),
    messages: z.array(z.object({
      query: z.string().min(1),
      metadata: z.record(z.string(), z.any()).optional(),
    })).optional(),
    responseCharacterLimit: z.number().optional(),
  });

  try {
    let body: BatchChatRequest;
    try {
      body = ChatRequestSchema.parse(await req.json()) as BatchChatRequest;
    } catch (err) {
      logger.warn('Input validation failed', { errors: err instanceof Error ? err.message : err });
      logger.info('Audit log', {
        action: 'chat_api_failed',
        status: 'invalid_input',
        error: err instanceof Error ? err.message : err,
        timestamp: new Date().toISOString(),
      });
      await ErrorAudit.apiError(
        undefined,
        '/api/widget/chat',
        400,
        'Invalid request body',
        requestId
      );
      return NextResponse.json(
        { error: 'Invalid request body', details: err instanceof Error ? err.message : undefined },
        { status: 400 }
      );
    }

    // Per-tenant rate limiting (30 req/min)
    // Extract tenantId from session if possible
    let isBatch = false;
    let batchMessages: Array<{ query: string; metadata?: Record<string, any> }> = [];
    let messageLength = 0;
    if (body.sessionId) {
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('tenant_id')
        .eq('session_id', body.sessionId)
        .single();
      tenantId = session?.tenant_id;
    }

    // Token Verification (Optional but enforced if provided)
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      try {
        const payload = verifyToken(token);
        if (tenantId && payload.tenantId !== tenantId) {
           logger.warn('Token tenantId mismatch', { tokenTenant: payload.tenantId, sessionTenant: tenantId });
           return NextResponse.json({ error: 'Unauthorized: Tenant mismatch' }, { status: 403 });
        }
      } catch (err) {
        logger.warn('Invalid token provided', { error: err instanceof Error ? err.message : err });
        return NextResponse.json({ error: 'Unauthorized: Invalid or expired token' }, { status: 401 });
      }
    }

    // Strict Trial Status Check
    if (tenantId) {
       const { data: tenantStatus } = await supabase
        .from('trial_tenants')
        .select('status, trial_expires_at')
        .eq('tenant_id', tenantId)
        .single();
       
       if (!tenantStatus) {
          return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
       }
       if (tenantStatus.status !== 'active') {
          return NextResponse.json({ error: 'Trial is not active' }, { status: 403 });
       }
       if (new Date(tenantStatus.trial_expires_at) < new Date()) {
          return NextResponse.json({ error: 'Trial has expired' }, { status: 403 });
       }
    }

    // Support batch queries: if body.messages (array) is present, use batching
    isBatch = Array.isArray(body.messages);
    batchMessages = isBatch ? body.messages : [];
    messageLength = isBatch
      ? batchMessages.reduce((sum, msg) => sum + ((msg?.query?.length ?? 0)), 0)
      : (body as any).message?.length || 0;
    if (!tenantId) {
      logger.warn('Missing tenantId for rate limiting');
      await ErrorAudit.apiError(undefined, '/api/widget/chat', 400, 'Missing tenantId for rate limiting', requestId);
      TrialLogger.logRequest('POST', '/api/widget/chat', 400, Date.now() - startTime, { requestId });
      return NextResponse.json({ error: 'Missing tenantId for rate limiting' }, { status: 400 });
    }

    // Enforce production tenant format early to avoid downstream crashes
    try {
      validateTenantId(tenantId);
    } catch (err) {
      logger.warn('Invalid tenantId format', { tenantIdPreview: tenantId.slice(0, 10), requestId });
      await ErrorAudit.apiError(tenantId, '/api/widget/chat', 400, 'Invalid tenant_id format', requestId);
      TrialLogger.logRequest('POST', '/api/widget/chat', 400, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Invalid tenant_id format (expected tn_* or uuid)' }, { status: 400 });
    }

    // Create usage tracker early so we can record rate-limits/failures
    tracker = trackUsage(tenantId!, 'chat_message', { session_id: body.sessionId });

    const allowed = await checkTenantRateLimit(tenantId!, 30, 60);
    if (!allowed) {
      if (tracker) await tracker.recordRateLimit();
      await ErrorAudit.apiError(tenantId, '/api/widget/chat', 429, 'Rate limit exceeded', requestId);
      TrialLogger.logRequest('POST', '/api/widget/chat', 429, Date.now() - startTime, { requestId, tenantId });
      incrementMetric('chat_api_errors_total', 'Total chat API errors', { path: '/api/widget/chat', status: '429' });
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Get session
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('*, trial_tenants(status, trial_expires_at, business_type)')
      .eq('session_id', body.sessionId)
      .single();

    if (!session) {
      if (tracker) await tracker.recordFailure(new Error('Session not found'), 404);
      incrementMetric('chat_api_errors_total', 'Total chat API errors', { path: '/api/widget/chat', status: '404' });
      await ErrorAudit.apiError(undefined, '/api/widget/chat', 404, 'Session not found', requestId);
      TrialLogger.logRequest('POST', '/api/widget/chat', 404, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    tenantId = session.tenant_id;
    if (!tenantId) {
      logger.error('Session missing tenantId', { session });
      if (tracker) await tracker.recordFailure(new Error('Session missing tenantId'), 500);
      await ErrorAudit.apiError(undefined, '/api/widget/chat', 500, 'Session missing tenantId', requestId);
      TrialLogger.logRequest('POST', '/api/widget/chat', 500, Date.now() - startTime, { requestId, tenantId });
      return NextResponse.json({ error: 'Session missing tenantId' }, { status: 500 });
    }

    // Integrate plan detection
    const { getPlanDetector } = await import('@/lib/plan-detector');
    const planDetector = getPlanDetector();
    const tenantPlanConfig = await planDetector.getTenantPlan(tenantId);

    // Modify prompt with plan-specific modifiers
    let planPromptModifiers: string[] = [];
    if (tenantPlanConfig) {
      planPromptModifiers = await planDetector.getPlanPromptModifiers(tenantId);
    }

    // Check if session expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (now > expiresAt) {
      incrementMetric('chat_api_errors_total', 'Total chat API errors', { path: '/api/widget/chat', status: '403' });
      await tracker.recordFailure(new Error('Session expired'), 403);
      return NextResponse.json({ error: 'Session has expired' }, { status: 403 });
    }

    // Check tenant status
    const tenant = Array.isArray(session.trial_tenants)
      ? session.trial_tenants[0]
      : session.trial_tenants;

    // Vertical-specific metadata to be injected into response
    let legalDisclaimer: string | undefined;
    let legalAnalysis: string | undefined;
    let financialDisclaimer: string | undefined;
    let transactionStatus: string | undefined;
    let realEstateDisclaimer: string | undefined;
    let propertyResults: any[] | undefined;
    let productResults: any[] | undefined;

    // Healthcare Compliance Check
    if (tenant?.business_type?.toLowerCase() === 'healthcare') {
      const messageText = isBatch 
        ? batchMessages.map(m => m.query).join(' ') 
        : (body as any).message || '';
        
      const { detected, maskedText } = detectAndMaskPHI(messageText);
      
      if (detected) {
        // For strict compliance, we might reject. For now, we'll mask and proceed.
        // If it's a batch, we'd need to mask each message individually.
        if (isBatch) {
          batchMessages.forEach(msg => {
            const result = detectAndMaskPHI(msg.query);
            msg.query = result.maskedText;
          });
        } else {
          (body as any).message = maskedText;
        }
        
        // Log the PHI detection event (without the actual PHI)
        console.log(`[Healthcare Compliance] PHI detected and masked for tenant ${tenantId}`);
      }
    }

    // Legal Compliance & Disclaimer Injection
    if (tenant?.business_type?.toLowerCase() === 'legal') {
      const jurisdiction = tenant?.jurisdiction || 'US';
      legalDisclaimer = getLegalDisclaimer(jurisdiction);
      
      if (isBatch) {
        batchMessages.forEach(msg => {
          if (!msg.metadata) msg.metadata = {};
          msg.metadata.legalDisclaimer = legalDisclaimer;
          if (/analyze/i.test(msg.query)) {
            msg.metadata.legalAnalysis = analyzeDocument(msg.query);
          }
        });
      } else {
        const messageText = (body as any).message || '';
        if (/analyze/i.test(messageText)) {
          legalAnalysis = analyzeDocument(messageText);
        }
      }
    }

    // Financial Compliance & Disclaimer Injection
    if (tenant?.business_type?.toLowerCase() === 'financial') {
      const { getFinancialDisclaimer, checkTransaction } = await import('@/lib/financial/compliance');
      financialDisclaimer = getFinancialDisclaimer();
      
      if (isBatch) {
        batchMessages.forEach(msg => {
          if (!msg.metadata) msg.metadata = {};
          msg.metadata.financialDisclaimer = financialDisclaimer;
          if (/transaction|transfer|payment/i.test(msg.query)) {
            const match = msg.query.match(/\d+/);
            const amount = match ? Number(match[0]) : 0;
            msg.metadata.transactionStatus = checkTransaction(amount).transactionStatus;
          }
        });
      } else {
        const messageText = (body as any).message || '';
        if (/transaction|transfer|payment/i.test(messageText)) {
          const match = messageText.match(/\d+/);
          const amount = match ? Number(match[0]) : 0;
          transactionStatus = checkTransaction(amount).transactionStatus;
        }
      }
    }

    // Real Estate: listing search, disclaimers, scheduling metadata
    if (['real_estate', 'realestate'].includes((tenant?.business_type || '').toLowerCase())) {
      const { searchProperties, getListingById: _getListingById, scheduleViewing: _scheduleViewing } = await import('@/lib/realestate/utils');
      realEstateDisclaimer = 'Listings are for informational purposes only. Confirm details with the listing agent.';

      if (isBatch) {
        batchMessages.forEach(msg => {
          if (!msg.metadata) msg.metadata = {};
          msg.metadata.realEstateDisclaimer = realEstateDisclaimer;
          if (/\b(find|listing|apartment|house|property|rent|sale|bedroom|studio)\b/i.test(msg.query)) {
            try {
              const results = searchProperties(msg.query, { location: undefined, limit: 5 });
              msg.metadata.propertyResults = results;
            } catch (e) {
              // ignore search errors in stub
            }
          }
        });
      } else {
        const messageText = (body as any).message || '';
        if (/\b(find|listing|apartment|house|property|rent|sale|bedroom|studio)\b/i.test(messageText)) {
          try {
            propertyResults = searchProperties(messageText, { location: undefined, limit: 5 });
          } catch (e) {
            propertyResults = undefined;
          }
        }
      }
    }

    // E-commerce: product search
    if (['ecommerce', 'retail', 'shop'].includes((tenant?.business_type || '').toLowerCase())) {
      const { searchProducts } = await import('@/lib/ecommerce/products');
      
      if (isBatch) {
        batchMessages.forEach(msg => {
          if (!msg.metadata) msg.metadata = {};
          if (/\b(buy|price|shop|looking for|find|search|product|item)\b/i.test(msg.query)) {
            try {
              const results = searchProducts(msg.query, { limit: 5 });
              msg.metadata.productResults = results;
            } catch (e) {
              // ignore search errors
            }
          }
        });
      } else {
        const messageText = (body as any).message || '';
        if (/\b(buy|price|shop|looking for|find|search|product|item)\b/i.test(messageText)) {
          try {
            productResults = searchProducts(messageText, { limit: 5 });
          } catch (e) {
            productResults = undefined;
          }
        }
      }
    }

    if (tenant.status !== 'active') {
      incrementMetric('chat_api_errors_total', 'Total chat API errors', { path: '/api/widget/chat', status: '403' });
      await tracker.recordFailure(new Error('Trial not active'), 403);
      return NextResponse.json({ error: 'Trial is no longer active' }, { status: 403 });
    }

    // Check quota - estimate tokens for each message + generation
    const estimatedTokens = isBatch ? Math.max(150, batchMessages.length * 150) : 150;
    const quotaCheck = await enforceQuota(tenantId!, 'tokens', estimatedTokens);
    if (!quotaCheck.allowed) {
      incrementMetric('chat_quota_exceeded_total', 'Total chat quota exceeded', { path: '/api/widget/chat', status: '429' });
      await tracker.recordRateLimit();
      await ErrorAudit.quotaExceeded(
        tenantId,
        'tokens',
        quotaCheck.quota_limit || 0,
        estimatedTokens
      );
      return NextResponse.json(
        {
          error: 'Quota exceeded. Please upgrade your plan.',
          quota_remaining: quotaCheck.tokens_remaining,
        },
        { status: 429 }
      );
    }

    // Record message received
    await ChatAudit.messageReceived(tenantId!, body.sessionId, messageLength);

    // Use enhanced hybrid RAG with Groq Llama-3-70B
    const { mcpHybridRagQuery } = await import('@/lib/ragPipeline');
    let ragResult: McpHybridRagResult | undefined;
    let responseTime: number;
    if (isBatch) {
      const { BatchRAGEngine } = await import('@/lib/rag/batch-rag-engine');
      const { TenantIsolatedRetriever } = await import('@/lib/rag/supabase-retriever-v2');
      const { getGroqClient } = await import('@/lib/rag/llm-client-with-breaker');
      const pLimit = (await import('p-limit')).default;
      const MAX_BATCH_SIZE = 10;
      const CHUNK_SIZE = 5;
      // Chunk batch messages if too large
      const chunkedBatches: Array<Array<{ query: string; metadata?: any }>> = [];
      for (let i = 0; i < batchMessages.length; i += CHUNK_SIZE) {
        chunkedBatches.push(batchMessages.slice(i, i + CHUNK_SIZE));
      }
      const retriever = await TenantIsolatedRetriever.create(tenantId!, {
        k: 5,
        similarityThreshold: 0.7,
        useCache: true,
        redisUrl: process.env.RAG_REDIS_URL,
      });
      const batchEngine = new BatchRAGEngine(tenantId!, retriever, getGroqClient());
      const limit = pLimit(3); // Gate LLM concurrency
      let totalTokens = 0;
      let totalLatency = 0;
      let allAudits: any[] = [];
      let batchResults: any[] = [];
      if (isStream) {
        // Streaming SSE for batch
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            for (const batchChunk of chunkedBatches) {
              const responseStartTime = Date.now();
              const batchResponse = await limit(() => batchEngine.executeBatch(
                batchChunk.map((msg: any) => ({
                  query: msg.query,
                  metadata: msg.metadata,
                  sessionId: body.sessionId,
                }))
              ));
              const chunkTokens = batchResponse.results.reduce((sum: number, result: any) => sum + result.usage.totalTokens, 0);
              const chunkLatency = Date.now() - responseStartTime;
              totalTokens += chunkTokens;
              totalLatency += chunkLatency;
              await tracker.recordSuccess({ tokens_used: chunkTokens, response_time_ms: chunkLatency, status_code: 200 });
              await ChatAudit.responseSent(tenantId!, body.sessionId, chunkTokens);
              for (let idx = 0; idx < batchResponse.results.length; idx++) {
                const result = batchResponse.results[idx];
                const msg = batchChunk[idx];
                const perMessageQuota = await enforceQuota(tenantId!, 'tokens', result.usage.totalTokens);
                const error = 'error' in result ? (result as any).error : undefined;
                const status = 'status' in result ? (result as any).status : undefined;
                const characterLimitApplied = 'characterLimitApplied' in result ? (result as any).characterLimitApplied : undefined;
                const originalLength = 'originalLength' in result ? (result as any).originalLength : undefined;
                const audit = 'audit' in result ? (result as any).audit : undefined;
                if (!perMessageQuota.allowed) {
                  if ('error' in result) (result as any).error = 'Quota exceeded for this message.';
                  if ('status' in result) (result as any).status = 'error';
                }
                await ChatAudit.responseSent(tenantId!, body.sessionId, result.usage.totalTokens);
                if (audit) {
                  allAudits.push(audit);
                }
                const entry = {
                  reply: result.answer,
                  sources: result.sources.map((source: any) => ({
                    text: source.content.substring(0, 200) + '...',
                    similarity: source.metadata?.similarity || null,
                  })),
                  tokens_used: result.usage.totalTokens,
                  latency_ms: result.latencyMs,
                  error: error || null,
                  characterLimitApplied: characterLimitApplied || null,
                  originalLength: originalLength || null,
                  audit: audit || null,
                  query: msg?.query,
                  metadata: msg?.metadata,
                  sessionId: body.sessionId,
                  status: error ? 'error' : 'success',
                  timestamp: new Date().toISOString(),
                };
                batchResults.push(entry);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
              }
              // Persist batch replies to chat_sessions
              const batchBotMessages = batchResponse.results.map((result: any) => ({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: result.answer,
                timestamp: new Date().toISOString(),
                error: result.error || null,
                characterLimitApplied: result.characterLimitApplied || null,
                originalLength: result.originalLength || null,
                audit: result.audit || null,
                status: result.error ? 'error' : 'success',
              }));
              const batchUserMessages = batchChunk.map((msg: any) => ({
                id: crypto.randomUUID(),
                role: 'user',
                content: msg.query,
                timestamp: new Date().toISOString(),
              }));
              const updatedBatchMessages = [...(session.messages || []), ...batchUserMessages, ...batchBotMessages];
              await supabase
                .from('chat_sessions')
                .update({
                  messages: updatedBatchMessages,
                  last_activity: now.toISOString(),
                })
                .eq('session_id', body.sessionId);
            }
            controller.close();
          }
        });
        recordApiCall('/api/widget/chat', 200, totalLatency);
        observeLatency('chat_batch_latency_ms', totalLatency, 'Batch chat latency (ms)', { path: '/api/widget/chat' });
        incrementMetric('chat_batch_success_total', 'Total successful batch chats', { path: '/api/widget/chat' });
        recordChatApiMetrics('/api/widget/chat', 'POST', 200, totalLatency);
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } else {
        // ...existing batch logic (non-stream)...
        const batchResults: any[] = [];
        for (const batchChunk of chunkedBatches) {
          const responseStartTime = Date.now();
          const batchResponse = await limit(() => batchEngine.executeBatch(
            batchChunk.map((msg: any) => ({
              query: msg.query,
              metadata: msg.metadata,
              sessionId: body.sessionId,
            }))
          ));
          const chunkTokens = batchResponse.results.reduce((sum: number, result: any) => sum + result.usage.totalTokens, 0);
          const chunkLatency = Date.now() - responseStartTime;
          totalTokens += chunkTokens;
          totalLatency += chunkLatency;
          await tracker.recordSuccess({ tokens_used: chunkTokens, response_time_ms: chunkLatency, status_code: 200 });
          await ChatAudit.responseSent(tenantId!, body.sessionId, chunkTokens);
          for (let idx = 0; idx < batchResponse.results.length; idx++) {
            const result = batchResponse.results[idx];
            const msg = batchChunk[idx];
            const perMessageQuota = await enforceQuota(tenantId!, 'tokens', result.usage.totalTokens);
            const error = 'error' in result ? (result as any).error : undefined;
            const status = 'status' in result ? (result as any).status : undefined;
            const characterLimitApplied = 'characterLimitApplied' in result ? (result as any).characterLimitApplied : undefined;
            const originalLength = 'originalLength' in result ? (result as any).originalLength : undefined;
            const audit = 'audit' in result ? (result as any).audit : undefined;
            if (!perMessageQuota.allowed) {
              if ('error' in result) (result as any).error = 'Quota exceeded for this message.';
              if ('status' in result) (result as any).status = 'error';
            }
            await ChatAudit.responseSent(tenantId!, body.sessionId, result.usage.totalTokens);
            if (audit) {
              allAudits.push(audit);
            }
            batchResults.push({
              reply: result.answer,
              sources: result.sources.map((source: any) => ({
                text: source.content.substring(0, 200) + '...',
                similarity: source.metadata?.similarity || null,
              })),
              tokens_used: result.usage.totalTokens,
              latency_ms: result.latencyMs,
              error: error || null,
              characterLimitApplied: characterLimitApplied || null,
              originalLength: originalLength || null,
              audit: audit || null,
              query: msg?.query,
              metadata: msg?.metadata,
              sessionId: body.sessionId,
              status: error ? 'error' : 'success',
              timestamp: new Date().toISOString(),
            });
          }
          // Persist batch replies to chat_sessions
          const batchBotMessages = batchResponse.results.map((result: any) => ({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: result.answer,
            timestamp: new Date().toISOString(),
            error: result.error || null,
            characterLimitApplied: result.characterLimitApplied || null,
            originalLength: result.originalLength || null,
            audit: result.audit || null,
            status: result.error ? 'error' : 'success',
          }));
          const batchUserMessages = batchChunk.map((msg: any) => ({
            id: crypto.randomUUID(),
            role: 'user',
            content: msg.query,
            timestamp: new Date().toISOString(),
          }));
          const updatedBatchMessages = [...(session.messages || []), ...batchUserMessages, ...batchBotMessages];
          await supabase
            .from('chat_sessions')
            .update({
              messages: updatedBatchMessages,
              last_activity: now.toISOString(),
            })
            .eq('session_id', body.sessionId);
        }
        await retriever.close();
        recordApiCall('/api/widget/chat', 200, totalLatency);
        recordChatApiMetrics('/api/widget/chat', 'POST', 200, totalLatency);
        return NextResponse.json({
          batch: batchResults,
          aggregated: batchResults.length <= CHUNK_SIZE,
          totalTokens,
          totalLatency,
          audits: allAudits,
          summary: {
            batchSize: batchResults.length,
            totalTokens,
            totalLatency,
            characterLimits: batchResults.map(r => r.characterLimitApplied),
            originalLengths: batchResults.map(r => r.originalLength),
            errors: batchResults.filter(r => r.error),
          },
        });
      }
    } else if (!isBatch && isStream) {
      // Streaming single-request path: perform retrieval then stream tokens
      const responseStartTime = Date.now();
      const queryText = `${planPromptModifiers.join('\n')}\n${(body as any).message}`;

      const { TenantIsolatedRetriever } = await import('@/lib/rag/supabase-retriever-v2');
      const retriever = await TenantIsolatedRetriever.create(tenantId!, {
        k: 5,
        similarityThreshold: 0.7,
        useCache: true,
        redisUrl: process.env.RAG_REDIS_URL,
      });

      let documents: any[] = [];
      try {
        documents = await retriever.retrieve(queryText);
      } catch (err) {
        // fall back to empty docs
        documents = [];
      }

      const sources = documents.map((doc: any, idx: number) => ({
        title: doc.metadata?.title || `source-${idx + 1}`,
        chunk: doc.pageContent,
        similarity: typeof doc.metadata?.similarity === 'number' ? doc.metadata.similarity : 0,
        index: idx + 1,
        metadata: doc.metadata || {},
      }));

      const context = documents.slice(0, 5).map((d: any, idx: number) => `Source [${idx + 1}] ${d.metadata?.title || ''}\n${d.pageContent}`).join('\n\n');

      // Use fast-reflection streaming generator for low-latency token streaming
      const { createFastReflection } = await import('@/lib/ai/fast-reflection');
      const engine = createFastReflection(tenantId!, 'fast');
      const streaming = await engine.generateStreaming(queryText, context);

      const encoder = new TextEncoder();
      let accumulated = '';
      let tokenCount = 0;

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streaming.stream) {
              accumulated += chunk;
              tokenCount += 1;
              const payload = { token: chunk, partial: accumulated };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            }

            // Wait for reflection/finalization
            const final = await streaming.finalResult;

            const donePayload: any = {
              done: true,
              final: final.response,
              confidence: final.confidence,
              metadata: final.metadata,
              sources,
            };

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(donePayload)}\n\n`));
            controller.close();

            // Persist messages and audits after streaming
            const reply = final.response;
            const tokensUsed = final.usage?.totalTokens ?? Math.ceil(reply.length / 4);
            await ChatAudit.responseSent(tenantId!, body.sessionId, tokensUsed);

            const userMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'user',
              content: (body as any).message,
              timestamp: new Date().toISOString(),
            };
            const botMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: reply,
              timestamp: new Date().toISOString(),
              metadata: {},
            };
            const updatedMessages = [...(session.messages || []), userMessage, botMessage];

            await supabase
              .from('chat_sessions')
              .update({ messages: updatedMessages, last_activity: new Date().toISOString() })
              .eq('session_id', body.sessionId);

            // Metrics
            const { recordStreamingTokens, observeStreamingLatency } = await import('@/lib/monitoring/metrics');
            recordStreamingTokens('/api/widget/chat', tokenCount);
            observeStreamingLatency('/api/widget/chat', Date.now() - responseStartTime);
            recordApiCall('/api/widget/chat', 200, Date.now() - responseStartTime);
            recordChatApiMetrics('/api/widget/chat', 'POST', 200, Date.now() - responseStartTime);
          } catch (err) {
            controller.error(err instanceof Error ? err : new Error('Streaming error'));
          } finally {
            try { await retriever.close(); } catch (_) {}
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    } else {
      const responseStartTime = Date.now();
      ragResult = await mcpHybridRagQuery({
        tenantId: session.tenant_id,
        query: `${planPromptModifiers.join('\n')}\n${(body as any).message}`,
        k: 5,
        llmProvider: 'groq',
        llmModel: 'llama-3-groq-70b-8192-tool-use-preview',
        responseCharacterLimit: (body as any).responseCharacterLimit,
      });
      responseTime = Date.now() - responseStartTime;
    }

    // Streaming response (SSE)
    if (isStream && !isBatch) {
      const singleResult = ragResult as McpHybridRagResult;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Simulate streaming by splitting response into chunks (e.g., by sentence)
          const sentences = singleResult.answer.split(/(?<=[.!?])\s+/);
          let partial = '';
          sentences.forEach((sentence: string, idx: number) => {
            partial += sentence + ' ';
            const payload: any = { token: sentence, partial };
            if (idx === sentences.length - 1) {
               payload.metadata = {
                  legalDisclaimer,
                  legalAnalysis,
                  financialDisclaimer,
                  transactionStatus,
                  realEstateDisclaimer,
                  propertyResults,
                  productResults
               };
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          });
          controller.close();
        }
      });
      // Monitoring: record API call for streaming
      recordApiCall('/api/widget/chat', 200, responseTime);
        recordChatApiMetrics('/api/widget/chat', 'POST', 200, responseTime);
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

    const singleResult = ragResult as McpHybridRagResult;
    if (!singleResult) {
      throw new Error('Missing RAG result for single request');
    }
    const reply = singleResult.answer;
    const searchResults = singleResult.sources;
    const inputLength = (body as any).message?.length || 0;
    const tokensUsed = singleResult.usage?.totalTokens ?? Math.ceil((inputLength + reply.length) / 4);
    await ChatAudit.responseSent(tenantId!, body.sessionId, tokensUsed);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: (body as any).message,
      timestamp: new Date().toISOString(),
    };
    const botMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
      metadata: {
        legalDisclaimer,
        legalAnalysis,
        financialDisclaimer,
        transactionStatus,
        realEstateDisclaimer,
        propertyResults,
        productResults
      }
    };
    const updatedMessages = [...(session.messages || []), userMessage, botMessage];

    await supabase
      .from('chat_sessions')
      .update({
        messages: updatedMessages,
        last_activity: now.toISOString(),
      })
      .eq('session_id', body.sessionId);

    // Persist citations extracted from RAG sources (non-blocking)
    try {
      const { trackCitations } = await import('@/lib/citations');
      // Only persist if citations feature flag is enabled for this tenant
      if (tenantPlanConfig?.feature_flags?.citations) {
        const citationRecords = (singleResult.sources || []).map((s: any) => ({
          tenant_id: tenantId!,
          conversation_id: (session as any).conversation_id || null,
          message_id: botMessage.id,
          source_title: s.title || (s.metadata && s.metadata.title) || null,
          source_url: (s.metadata && (s.metadata.source_url || s.metadata.url)) || null,
          excerpt: s.chunk ? (s.chunk.substring(0, 1000)) : null,
          confidence_score: typeof s.similarity === 'number' ? Math.max(0, Math.min(1, s.similarity)) : 0.5,
          metadata: s.metadata || {},
        }));
          if (citationRecords.length > 0) {
          // fire-and-forget but await to capture errors gracefully
          const _res = await trackCitations(citationRecords);
          if (!_res.success) {
            console.warn('Failed to track citations', _res.error);
          }
        }
      }
    } catch (err) {
      // Non-fatal: do not break response if citation persistence fails
      console.warn('Citation persistence error', err instanceof Error ? err.message : err);
    }

    await tracker.recordSuccess({
      tokens_used: tokensUsed,
      response_time_ms: responseTime,
      status_code: 200,
    });

    TrialLogger.logRequest(
      'POST',
      '/api/widget/chat',
      200,
      Date.now() - startTime,
      {
        requestId,
        tenantId,
        sessionId: body.sessionId,
        responseTime,
        characterLimitApplied: singleResult.characterLimitApplied || null,
        originalLength: singleResult.originalLength || null,
        replyLength: singleResult.answer.length,
        error: singleResult.llmError || null,
      }
    );

    const response = {
      reply,
      sources: searchResults.map((r: any) => ({
        text: r.chunk?.substring(0, 200) + '...' || '',
        similarity: r.score,
      })),
      metadata: {
        legalDisclaimer,
        legalAnalysis,
        financialDisclaimer,
        transactionStatus,
        realEstateDisclaimer,
        propertyResults,
        productResults
      }
    };

    recordApiCall('/api/widget/chat', 200, responseTime);
    return NextResponse.json(response);
  } catch (error) {
    // Mask PII in error logs and redact secrets
    let errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errorMsg = maskPII(errorMsg);
    // Redact secrets (simple: redact API keys)
    errorMsg = errorMsg.replace(/sk-[A-Za-z0-9]{32,}/g, 'sk-REDACTED');
    TrialLogger.error('Widget chat error', error instanceof Error ? error : undefined, {
      requestId,
      tenantId: undefined,
      path: '/api/widget/chat',
    });
    // Monitoring: record error API call
    const { recordApiCall } = await import('@/lib/monitoring');
    recordApiCall('/api/widget/chat', 500, Date.now() - startTime);
    recordChatApiMetrics('/api/widget/chat', 'POST', 500, Date.now() - startTime);
    await ErrorAudit.apiError(
      undefined,
      '/api/widget/chat',
      500,
      errorMsg,
      requestId
    );
    return NextResponse.json(
      { error: 'Failed to process message. Please try again.', details: errorMsg },
      { status: 500 }
    );
  }
}

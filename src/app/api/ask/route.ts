/**
 * BiTB RAG Query API Route - Tenant-Isolated Retrieval
 * POST /api/ask
 *
 * SECURITY:
 * - Validates tenant_id and trial_token
 * - All vector queries filtered by tenant_id
 * - RLS enforces tenant isolation
 * - Increments query usage counter
 */

import { NextRequest, NextResponse } from "next/server";
// import { ChatPromptTemplate } from "@langchain/core/prompts";
// LlamaIndex: Use manual prompt construction or LlamaIndex prompt utilities instead.
import { createClient } from "@supabase/supabase-js";
import { getSupabaseRetriever } from "@/lib/rag/supabase-retriever";
import { createLlm } from "@/lib/rag/llm-factory";
import { AuditLogger } from "@/lib/security/audit-logging";
import { PIIMasker, detectPII } from "@/lib/security/pii-masking";
import {
  checkQueryLimit,
  incrementQueryUsage,
  validateTenantContext,
} from "@/lib/middleware/tenant-context";
import TrialLogger from '@/lib/trial/logger';
import { isPipelineReady } from '@/lib/trial/pipeline-readiness';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';
import { checkTenantRateLimit } from '@/middleware/tenant-rate-limit';
import { enforceQuota } from '@/lib/trial/quota-enforcer';

/**
 * Handle batch query with SSE progress updates
 */
async function handleBatchQuery(
  tenant_id: string,
  trial_token: string | undefined,
  queries: Array<{ query: string; metadata?: Record<string, any>; sessionId?: string }>,
  sessionId: string | undefined,
  startTime: number
) {
  try {
    // Use BatchRAGEngine for intelligent aggregation
    const { BatchRAGEngine } = await import('@/lib/rag/batch-rag-engine');
    const { TenantIsolatedRetriever } = await import('@/lib/rag/supabase-retriever-v2');
    const { GroqClientWithBreaker } = await import('@/lib/rag/llm-client-with-breaker');
    
    // Initialize RAG components
    const retriever = await TenantIsolatedRetriever.create(tenant_id, { k: 5, similarityThreshold: 0.7 });
    const llmClient = new GroqClientWithBreaker(
      process.env.GROQ_API_KEY,
      'llama-3-groq-70b-8192-tool-use-preview'
    );
    
    const batchEngine = new BatchRAGEngine(
      tenant_id,
      retriever,
      llmClient
    );

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send progress updates
          for (let i = 0; i < queries.length; i++) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  progress: {
                    current: i + 1,
                    total: queries.length,
                    query: queries[i].query,
                  },
                })}\n\n`
              )
            );
          }

          // Execute batch
          const batchResult = await batchEngine.executeBatch(
            queries.map(q => ({
              query: q.query,
              metadata: q.metadata,
              sessionId: q.sessionId || sessionId,
            }))
          );

          // Send final results
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                results: batchResult.results,
                totalTokens: batchResult.totalTokens,
                totalLatencyMs: batchResult.totalLatencyMs,
                aggregated: batchResult.aggregated,
              })}\n\n`
            )
          );

          controller.close();
        } catch (error) {
          console.error('Batch stream error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: 'Batch processing failed',
                results: queries.map(q => ({
                  query: q.query,
                  answer: 'Error processing query',
                  sources: [],
                  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                  latencyMs: 0,
                  cached: false,
                })),
                totalTokens: 0,
                totalLatencyMs: Date.now() - startTime,
                aggregated: false,
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Batch query error:', error);
    return NextResponse.json(
      {
        error: 'Batch processing failed',
        results: queries.map(q => ({
          query: q.query,
          answer: 'Error processing query',
          sources: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: 0,
          cached: false,
        })),
        totalTokens: 0,
        totalLatencyMs: Date.now() - startTime,
        aggregated: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: any, context: { params: Promise<{}> }) {
  const startTime = Date.now();
  const correlationId = request.headers.get('x-correlation-id') || `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenant_id: string | undefined = undefined;
  try {
    // Baseline IP/user rate limit (cheap, before parsing user payload)
    const ipRateLimitResponse = await rateLimit(request, RATE_LIMITS.ask);
    if (ipRateLimitResponse) return ipRateLimitResponse;

    // Parse body once (NextRequest body is single-consumption)
    let body: any;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        {
          error: 'SECURITY: Invalid request format',
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      );
    }

    // SECURITY: Validate tenant context (fail-closed)
    const validationError = await validateTenantContext(request, body);
    if (validationError) {
      return validationError;
    }

    const { tenant_id: tid, trial_token, query, queries, batch, responseCharacterLimit, sessionId } = body as {
      tenant_id: string;
      trial_token?: string;
      query?: string;
      queries?: Array<{ query: string; metadata?: Record<string, any>; sessionId?: string }>;
      batch?: boolean;
      responseCharacterLimit?: 250 | 450;
      sessionId?: string;
    };
    tenant_id = tid;

    // Tenant-scoped rate limiting (prevents one tenant from hogging capacity)
    // 30 req/min per tenant is a reasonable default for trial traffic.
    const tenantAllowed = await checkTenantRateLimit(tenant_id, 30, 60);
    if (!tenantAllowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please wait before sending more requests.',
          code: 'RATE_LIMIT_EXCEEDED',
        },
        { status: 429 }
      );
    }

    // Handle batch mode (enforce token quota before starting SSE work)
    if (batch && queries && queries.length > 0) {
      const estimatedTokens = Math.max(150, queries.length * 150);
      const quotaCheck = await enforceQuota(tenant_id, 'tokens', estimatedTokens);
      if (!quotaCheck.allowed) {
        return NextResponse.json(
          {
            error: 'Quota exceeded. Please upgrade your plan.',
            quota_remaining: quotaCheck.tokens_remaining,
          },
          { status: 429 }
        );
      }
      return handleBatchQuery(tenant_id, trial_token, queries, sessionId, startTime);
    }

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    // GUARDRAIL: detect and log PII before processing
    const piiDetections = detectPII(query);
    if (piiDetections.length > 0) {
      await AuditLogger.logPIIDetection(tenant_id, piiDetections.map(d => d.type), query);
    }

    // Check query limit for trial users
    if (trial_token) {
      const { allowed, remaining } = await checkQueryLimit(tenant_id, trial_token);
      if (!allowed) {
        return NextResponse.json(
          {
            error: "Query limit exceeded. Please upgrade your plan.",
            code: "QUERY_LIMIT_EXCEEDED",
            queries_remaining: 0,
          },
          { status: 429 }
        );
      }
    }

    // Enforce per-tenant daily token quota for /api/ask as well.
    // Estimate is conservative to avoid accidental over-blocking.
    {
      const estimatedTokens = Math.max(200, estimateTokensFromText(query) + 300);
      const quotaCheck = await enforceQuota(tenant_id, 'tokens', estimatedTokens);
      if (!quotaCheck.allowed) {
        return NextResponse.json(
          {
            error: 'Quota exceeded. Please upgrade your plan.',
            quota_remaining: quotaCheck.tokens_remaining,
          },
          { status: 429 }
        );
      }
    }

    // Use enhanced hybrid RAG with Groq Llama-3-70B
    const { mcpHybridRagQuery } = await import('@/lib/ragPipeline');
    const { createRagQueryTrace } = await import('@/lib/observability/langfuse-client');
    
    // Create trace for API request
    const traceId = `api-${tenant_id}-${Date.now()}`;
    const trace = createRagQueryTrace(traceId, tenant_id, query);
    
    // Mask PII for query
    const maskedQuery = PIIMasker.forLLM(query).masked_text;
    
    // Log PII detection in trace
    if (trace && piiDetections.length > 0) {
      try {
        trace.event({
          name: 'pii-detected',
          metadata: {
            pii_types: piiDetections.map(d => d.type),
            masked: true,
          },
        });
      } catch (err) {
        // Event logging is best-effort
      }
    }
    
    // Get tenant LLM preferences and enforce pipeline readiness before querying
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await supabase.rpc('set_tenant_context', { p_tenant_id: tenant_id });

    const [trialResult, lastJobResult, tenantStatusResult] = await Promise.all([
      supabase
        .from('trials')
        .select('llm_provider, llm_model')
        .eq('tenant_id', tenant_id)
        .single(),
      supabase
        .from('ingestion_jobs')
        .select('status, updated_at, job_id, embeddings_count')
        .eq('tenant_id', tenant_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('tenants')
        .select('status')
        .eq('tenant_id', tenant_id)
        .single(),
    ]);

    const { data: trial } = trialResult;
    const { data: lastJob } = lastJobResult;
    let vectorCount = typeof (lastJob as any)?.embeddings_count === 'number' ? (lastJob as any).embeddings_count : 0;
    if (!lastJob || typeof (lastJob as any).embeddings_count !== 'number') {
      const { count } = await supabase
        .from('embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id);
      vectorCount = count ?? 0;
    }
    const { data: tenantStatus } = tenantStatusResult;

    const minVectors = Number(process.env.MIN_PIPELINE_VECTORS ?? '10');
    const ready = isPipelineReady({
      ragStatus: tenantStatus?.status || null,
      lastJobStatus: lastJob?.status || null,
      vectorCount: vectorCount ?? 0,
      minVectors,
    });

    if (!ready) {
      TrialLogger.warn('Ask blocked: pipeline not ready', {
        tenantId: tenant_id,
        vectorCount,
        lastJobStatus: lastJob?.status,
        minVectors,
        correlationId,
      });
      return NextResponse.json(
        {
          error: 'pipeline_not_ready',
          message: 'Your knowledge base is still preparing. Please wait a moment and try again.',
          code: 'PIPELINE_NOT_READY',
          retryAfterMs: 5000,
          vectorCount: vectorCount ?? 0,
          lastJobStatus: lastJob?.status || null,
          correlationId,
        },
        { status: 425 }
      );
    }

    const llmProvider = trial?.llm_provider || 'groq';
    const llmModel = trial?.llm_model || 'llama-3-groq-70b-8192-tool-use-preview';

    // Run hybrid search + LLM synthesis
    const ragResult = await mcpHybridRagQuery({
      tenantId: tenant_id,
      query: maskedQuery,
      k: 4,
      llmProvider,
      llmModel,
      responseCharacterLimit,
    });

    const answer = ragResult.answer;
    const sources = ragResult.sources.map((s: any) => ({
      content: s.chunk,
      metadata: { title: s.title, index: s.index },
    }));

    // Increment query usage
    if (trial_token) {
      await incrementQueryUsage(tenant_id, trial_token);
    }

    // Prepare response payload early for confidence value
    const responsePayload = {
      answer,
      sources,
      confidence: sources.length > 0 ? 0.8 : 0.1,
      preview: false,
    };

    // Update Langfuse trace with API-level metrics
    if (trace) {
      try {
        trace.update({
          output: {
            answer: answer.substring(0, 500),
            sources_count: sources.length,
            confidence: responsePayload.confidence,
          },
          metadata: {
            tenant_id: tenant_id,
            trial_token: trial_token ? 'present' : 'absent',
            api_latency_ms: Date.now() - startTime,
            llm_provider: llmProvider,
            llm_model: llmModel,
            character_limit: ragResult.characterLimitApplied,
            pii_detected: piiDetections.length > 0,
            success: true,
          },
          tags: [
            `tenant:${tenant_id}`,
            `api:ask`,
            `provider:${llmProvider}`,
            'success',
          ],
        });
      } catch (err) {
        // Trace update is best-effort
      }
    }

    // Log request and response metrics
    TrialLogger.logRequest(
      'POST',
      '/api/ask',
      200,
      Date.now() - startTime,
      {
        tenantId: tenant_id,
        responseCharacterLimit: ragResult.characterLimitApplied || null,
        originalLength: ragResult.originalLength || null,
        replyLength: ragResult.answer.length,
        error: ragResult.llmError || null,
      }
    );

    return NextResponse.json(responsePayload);
  } catch (error) {
    TrialLogger.error('Ask API error', error instanceof Error ? error : undefined, {
      tenantId: tenant_id,
      path: '/api/ask',
      correlationId,
    });
    return NextResponse.json(
      {
        answer: "I ran into an issue retrieving that information. Please try again in a moment.",
        sources: [],
        confidence: 0.1,
        error: "Internal server error",
        correlationId,
      },
      { status: 500 },
    );
  }
}

function estimateTokensFromText(text: string): number {
  // Rough approximation: ~4 chars per token for English-like text.
  const normalized = String(text || '');
  return Math.ceil(normalized.length / 4);
}
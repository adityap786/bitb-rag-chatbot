import crypto from 'crypto';
import { formatResponseByCharacterLimit, type ResponseCharacterLimit } from './responseLimiter';
import type { SemanticSearchResult } from '../types/trial';
import TrialLogger from './trial/logger';
import { validateTenantId } from './security/rag-guardrails';
import { TenantIsolatedRetriever } from './rag/supabase-retriever-v2';
import { getGroqClient } from './rag/llm-client-with-breaker';
import { logger } from './observability/logger';
import { createRagQueryTrace } from './observability/langfuse-client';
import { recordRagQueryMetrics } from './monitoring/metrics';
import { langCacheSearch, langCacheSet } from './langcache-api';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface RagSource {
  title: string;
  chunk: string;
  similarity: number;
  index: number;
  metadata?: Record<string, any>;
}

interface CachedRagResponse {
  answer: string;
  sources: RagSource[];
  confidence: number;
  llmError: string | null;
  llmProvider: string;
  llmModel: string;
  latencyMs: number;
  characterLimitApplied: ResponseCharacterLimit | null;
  originalLength: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}


const fallbackResponseCache = new Map<string, { response: CachedRagResponse; timestamp: number }>();

function createResponseCacheKey(params: {
  tenantId: string;
  llmProvider: string;
  llmModel: string;
  k: number;
  query: string;
}): string {
  const payload = `${params.tenantId}|${params.llmProvider}|${params.llmModel}|${params.k}|${params.query}`;
  return crypto.createHash('sha1').update(payload).digest('hex');
}




export interface McpHybridRagResult {
  answer: string;
  sources: RagSource[];
  confidence: number;
  llmError: string | null;
  llmProvider: string;
  llmModel: string;
  latencyMs: number;
  characterLimitApplied: ResponseCharacterLimit | null;
  originalLength: number;
  cache?: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface McpHybridRagQueryParams {
  tenantId: string;
  query: string;
  k?: number;
  llmProvider?: string;
  llmModel?: string;
  responseCharacterLimit?: ResponseCharacterLimit;
}

function buildContextFromResults(results: Array<{ chunk_text?: string; chunk?: string }>): string {
  return (results || [])
    .map((r) => r.chunk_text ?? r.chunk ?? '')
    .filter(Boolean)
    .slice(0, 6)
    .join('\n\n');
}

export async function mcpHybridRagQuery({
  tenantId,
  query,
  k = 5,
  llmProvider = 'groq',
  llmModel = 'llama-3-groq-70b-8192-tool-use-preview',
  responseCharacterLimit,
}: McpHybridRagQueryParams): Promise<McpHybridRagResult> {
  validateTenantId(tenantId);
  const startTime = Date.now();
  const cacheKey = createResponseCacheKey({ tenantId, llmProvider, llmModel, k, query });

  // Normalized LLM usage info (if available)
  let llmUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

  // 1. Try LangCache SaaS semantic cache
  try {
    const langCacheResult = await langCacheSearch(cacheKey);
    if (langCacheResult && langCacheResult.response) {
      logger.info('LangCache SaaS hit', {
        tenantId,
        llmProvider,
        llmModel,
        k,
        source: 'langcache-saas',
      });
      return {
        ...langCacheResult.response,
        latencyMs: Date.now() - startTime,
        cache: true,
      };
    }
  } catch (err) {
    logger.warn('LangCache SaaS search failed', {
      error: err instanceof Error ? err.message : String(err),
      tenantId,
      llmProvider,
      llmModel,
      k,
      source: 'langcache-saas',
    });
  }

  const cachedFromLocal = fallbackResponseCache.get(cacheKey);
  if (cachedFromLocal && Date.now() - cachedFromLocal.timestamp < CACHE_TTL_MS) {
    return {
      ...cachedFromLocal.response,
      latencyMs: Date.now() - startTime,
      cache: true,
    };
  }

  let llmError: string | null = null;
  let answer = '';
  let sources: RagSource[] = [];
  let semanticResults: SemanticSearchResult[] = [];
  
  // Create Langfuse trace for this RAG query
  const traceId = crypto.createHash('sha1').update(`${tenantId}:${query}:${Date.now()}`).digest('hex');
  const trace = createRagQueryTrace(traceId, tenantId, query);
  
  const retriever = await TenantIsolatedRetriever.create(tenantId, {
    k,
    similarityThreshold: 0.7,
    useCache: true,
    redisUrl: process.env.RAG_REDIS_URL,
    cacheTtlSeconds: 300,
  });

  try {
    // SPAN: Retrieval
    const retrievalStartTime = Date.now();
    const documents = await retriever.retrieve(query);
    const retrievalLatencyMs = Date.now() - retrievalStartTime;
    
    // Log retrieval span
    if (trace) {
      try {
        trace.span({
          name: 'retrieval',
          input: { query, k, similarity_threshold: 0.7 },
          output: { 
            documents_retrieved: documents.length,
            top_similarity: documents.length > 0 ? documents[0].metadata?.similarity : null,
          },
          metadata: {
            tenant_id: tenantId,
            latency_ms: retrievalLatencyMs,
            cache_used: documents.length > 0 ? documents[0].metadata?.cached : false,
          },
        });
      } catch (err) {
        // Span logging is best-effort
      }
    }
    semanticResults = documents.map((doc, index) => ({
      embedding_id: doc.metadata?.id || doc.metadata?.embedding_id || `doc-${index + 1}`,
      kb_id: doc.metadata?.kb_id || doc.metadata?.source_id || `doc-${index + 1}`,
      chunk_text: doc.pageContent,
      similarity: typeof doc.metadata?.similarity === 'number' ? doc.metadata.similarity : 0,
      metadata: doc.metadata || {},
    }));
    sources = documents.map((doc, index) => ({
      title: doc.metadata?.title || doc.metadata?.kb_id || `source-${index + 1}`,
      chunk: doc.pageContent,
      similarity: typeof doc.metadata?.similarity === 'number' ? doc.metadata.similarity : 0,
      index: index + 1,
      metadata: doc.metadata || {},
    }));

    if (documents.length === 0) {
      answer = 'No relevant information was found for that query.';
    } else {
      const context = buildContextFromResults(semanticResults);
      const llmClient = getGroqClient();
      
      // SPAN: LLM Generation
      const llmStartTime = Date.now();
      const llmResponse = await llmClient.complete({
        model: llmModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Answer using the provided context only and cite sources as [n].' },
          { role: 'user', content: `Question: ${query}\n\nContext:\n${context}` },
        ],
        temperature: 0.15,
        maxTokens: 512,
      });
      const llmLatencyMs = Date.now() - llmStartTime;
      answer = llmResponse.content;
      if (llmResponse.usage) {
        llmUsage = {
          promptTokens: llmResponse.usage.promptTokens,
          completionTokens: llmResponse.usage.completionTokens,
          totalTokens: llmResponse.usage.totalTokens,
        };
      }
      
      // Log LLM generation span with token usage
      if (trace) {
        try {
          trace.generation({
            name: 'llm-generation',
            model: llmModel,
            modelParameters: {
              temperature: 0.15,
              maxTokens: 512,
            },
            input: {
              query,
              context_length: context.length,
              sources_count: documents.length,
            },
            output: {
              answer: answer.substring(0, 500), // Truncate for trace storage
            },
            metadata: {
              tenant_id: tenantId,
              latency_ms: llmLatencyMs,
              provider: llmProvider,
            },
            usage: {
              promptTokens: llmResponse.usage?.promptTokens ?? (llmResponse.usage as any)?.prompt_tokens ?? 0,
              completionTokens: llmResponse.usage?.completionTokens ?? (llmResponse.usage as any)?.completion_tokens ?? 0,
              totalTokens: llmResponse.usage?.totalTokens ?? (llmResponse.usage as any)?.total_tokens ?? 0,
            },
          });
        } catch (err) {
          // Span logging is best-effort
        }
      }
    }
  } catch (error: any) {
    llmError = error?.message ?? 'Unknown inference error';
    TrialLogger.error('mcpHybridRagQuery failed', error, { tenantId, query });
    if (!answer) {
      answer = 'I could not reach the knowledge base right now. Please try again shortly.';
    }
  } finally {
    await retriever.close();
  }

  const latencyMs = Date.now() - startTime;
  const originalLength = answer.length;
  if (responseCharacterLimit) {
    answer = formatResponseByCharacterLimit(answer, responseCharacterLimit);
  }

  const finalResult: McpHybridRagResult = {
    answer,
    sources,
    confidence: sources.length > 0 ? 0.8 : 0.3,
    llmError,
    llmProvider,
    llmModel,
    latencyMs,
    characterLimitApplied: responseCharacterLimit || null,
    originalLength,
    usage: llmUsage,
  };

  const cachePayload: CachedRagResponse = {
    answer: finalResult.answer,
    sources: finalResult.sources,
    confidence: finalResult.confidence,
    llmError: finalResult.llmError,
    llmProvider: finalResult.llmProvider,
    llmModel: finalResult.llmModel,
    latencyMs: finalResult.latencyMs,
    characterLimitApplied: finalResult.characterLimitApplied,
    originalLength: finalResult.originalLength,
    usage: finalResult.usage,
  };

  fallbackResponseCache.set(cacheKey, { response: cachePayload, timestamp: Date.now() });
  try {
    await langCacheSet(cacheKey, cachePayload);
  } catch (err) {
    logger.warn('LangCache SaaS set failed', {
      error: err instanceof Error ? err.message : String(err),
      tenantId,
      llmProvider,
      llmModel,
      k,
      source: 'langcache-saas',
    });
  }

  // Record Prometheus metrics
  recordRagQueryMetrics(
    finalResult.llmError === null,
    finalResult.latencyMs,
    finalResult.sources.length
  );

  // Update Langfuse trace with final results
  if (trace) {
    try {
      trace.update({
        output: {
          answer: finalResult.answer.substring(0, 500),
          sources_count: finalResult.sources.length,
          confidence: finalResult.confidence,
          character_limit_applied: finalResult.characterLimitApplied,
          original_length: finalResult.originalLength,
        },
        metadata: {
          tenant_id: tenantId,
          llm_provider: finalResult.llmProvider,
          llm_model: finalResult.llmModel,
          total_latency_ms: finalResult.latencyMs,
          success: finalResult.llmError === null,
          error: finalResult.llmError,
          k: k,
          cached: false,
        },
        tags: [
          `tenant:${tenantId}`,
          `model:${finalResult.llmModel}`,
          `provider:${finalResult.llmProvider}`,
          finalResult.llmError ? 'error' : 'success',
        ],
      });
    } catch (err) {
      // Trace update is best-effort
      logger.warn('Failed to update Langfuse trace', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return finalResult;
}

export async function batchMcpHybridRagQuery(params: {
  tenantId: string;
  queries: string[];
  k?: number;
  llmProvider?: string;
  llmModel?: string;
  responseCharacterLimit?: ResponseCharacterLimit;
}): Promise<McpHybridRagResult[]> {
  if (!params.queries || params.queries.length === 0) {
    return [];
  }

  const concurrency = Math.max(1, Math.min(4, params.queries.length));
  const responses: McpHybridRagResult[] = new Array(params.queries.length);
  const active: Promise<void>[] = [];

  for (let index = 0; index < params.queries.length; index += 1) {
    const query = params.queries[index];
    const task = (async () => {
      responses[index] = await mcpHybridRagQuery({
        tenantId: params.tenantId,
        query,
        k: params.k,
        llmProvider: params.llmProvider,
        llmModel: params.llmModel,
        responseCharacterLimit: params.responseCharacterLimit,
      });
    })();

    active.push(task);
    const cleanup = () => {
      const i = active.indexOf(task);
      if (i >= 0) {
        active.splice(i, 1);
      }
    };
    task.then(cleanup, cleanup);

    if (active.length >= concurrency) {
      await Promise.race(active);
    }
  }

  await Promise.all(active);
  return responses.filter((res): res is McpHybridRagResult => Boolean(res));
}


/**
 * HybridQueryPipeline - Unified Production RAG Query Pipeline
 * 
 * Integrates:
 * - LlamaIndex for RAG (chunking, embeddings, retrieval)
 * - LangChain for orchestration (memory, routing, agents)
 * - Circuit breakers for resilience
 * - Distributed tracing (OpenTelemetry + Langfuse)
 * - Layer-wise caching
 */

import { logger } from '../observability/logger';
import { createRAGQueryTrace, updateRAGQueryTrace } from '../observability/langfuse-client';
import { GroqClientWithBreaker } from './llm-client-with-breaker';
import { HybridSearch, HybridSearchOptions } from './hybrid-search';
import { BatchRetriever } from './batch-retriever';
import { TenantIsolatedRetriever } from './supabase-retriever-v2';
import { ConversationMemoryManager } from '../memory/conversation-memory-manager';
import { SupervisorAgent } from '../agents/supervisor-agent';
import crypto from 'crypto';
import { 
  RAG_SYSTEM_PROMPT, 
  HYDE_PROMPT_TEMPLATE, 
  RERANKING_PROMPT,
  formatPrompt,
  buildRAGUserPrompt,
  buildRerankingPrompt,
} from '../prompts';

// --- Types ---

export interface QueryContext {
  tenantId: string;
  sessionId: string;
  userId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}

export interface QueryResult {
  answer: string;
  sources: Array<{
    id: string;
    content: string;
    score: number;
    metadata: Record<string, unknown>;
  }>;
  traceId: string;
  latencyMs: number;
  cached: boolean;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface PipelineOptions {
  enableCache?: boolean;
  cacheTtlMs?: number;
  enableTracing?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  topK?: number;
  similarityThreshold?: number;
  useReranking?: boolean;
  useHyDE?: boolean;
}

// --- Cache ---

interface CacheEntry {
  result: QueryResult;
  timestamp: number;
}

class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(ttlMs = 300_000, maxSize = 1000) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  private buildKey(tenantId: string, query: string): string {
    return crypto.createHash('sha256').update(`${tenantId}:${query}`).digest('hex');
  }

  get(tenantId: string, query: string): QueryResult | null {
    const key = this.buildKey(tenantId, query);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  set(tenantId: string, query: string, result: QueryResult): void {
    const key = this.buildKey(tenantId, query);
    // LRU eviction
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  invalidate(tenantId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(tenantId)) {
        this.cache.delete(key);
      }
    }
  }
}

// --- Pipeline ---

export class HybridQueryPipeline {
  private readonly cache: QueryCache;
  private readonly options: Required<PipelineOptions>;
  private readonly llmClient: GroqClientWithBreaker;

  constructor(options: PipelineOptions = {}) {
    this.options = {
      enableCache: options.enableCache ?? true,
      cacheTtlMs: options.cacheTtlMs ?? 300_000,
      enableTracing: options.enableTracing ?? true,
      maxRetries: options.maxRetries ?? 3,
      timeoutMs: options.timeoutMs ?? 30_000,
      topK: options.topK ?? 5,
      similarityThreshold: options.similarityThreshold ?? 0.7,
      useReranking: options.useReranking ?? true,
      useHyDE: options.useHyDE ?? false,
    };
    this.cache = new QueryCache(this.options.cacheTtlMs);
    this.llmClient = new GroqClientWithBreaker();
  }

  /**
   * Execute a RAG query with full pipeline
   */
  async query(query: string, context: QueryContext): Promise<QueryResult> {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();

    // Start trace
    const trace = this.options.enableTracing
      ? createRAGQueryTrace(traceId, context.tenantId, query)
      : null;

    try {
      // Check cache
      if (this.options.enableCache) {
        const cached = this.cache.get(context.tenantId, query);
        if (cached) {
          logger.debug('HybridQueryPipeline cache hit', { traceId, tenantId: context.tenantId });
          if (trace) {
            updateRAGQueryTrace(trace, {
              output: { cached: true, answer: cached.answer },
              metadata: { cached: true, latencyMs: Date.now() - startTime },
            });
          }
          return { ...cached, cached: true, traceId, latencyMs: Date.now() - startTime };
        }
      }

      // 1. Query transformation (optional HyDE)
      let transformedQuery = query;
      if (this.options.useHyDE) {
        transformedQuery = await this.applyHyDE(query, trace);
      }

      // 2. Hybrid retrieval
      const retrievalStart = Date.now();
      const documents = await this.retrieve(transformedQuery, context.tenantId, trace);
      const retrievalLatencyMs = Date.now() - retrievalStart;

      // 3. Reranking (optional)
      let rankedDocs = documents;
      if (this.options.useReranking && documents.length > 0) {
        rankedDocs = await this.rerank(query, documents, trace);
      }

      // 4. Generate answer with LLM
      const generationStart = Date.now();
      const { answer, tokensUsed } = await this.generateAnswer(query, rankedDocs, context, trace);
      const generationLatencyMs = Date.now() - generationStart;

      // Build result
      const result: QueryResult = {
        answer,
        sources: rankedDocs.map((doc, idx) => ({
          id: String(doc.metadata?.id || `doc-${idx}`),
          content: doc.pageContent.slice(0, 500),
          score: Number(doc.metadata?.score ?? 1.0),
          metadata: doc.metadata || {},
        })),
        traceId,
        latencyMs: Date.now() - startTime,
        cached: false,
        tokensUsed,
      };

      // Update trace
      if (trace) {
        updateRAGQueryTrace(trace, {
          output: { answer, sources: result.sources.length },
          metadata: {
            cached: false,
            latencyMs: result.latencyMs,
            retrievalLatencyMs,
            generationLatencyMs,
            tokensUsed,
          },
        });
      }

      // Cache result
      if (this.options.enableCache) {
        this.cache.set(context.tenantId, query, result);
      }

      logger.info('HybridQueryPipeline completed', {
        traceId,
        tenantId: context.tenantId,
        latencyMs: result.latencyMs,
        sourcesCount: result.sources.length,
      });

      return result;
    } catch (error) {
      logger.error('HybridQueryPipeline failed', {
        traceId,
        tenantId: context.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (trace) {
        updateRAGQueryTrace(trace, {
          output: { error: error instanceof Error ? error.message : String(error) },
          metadata: { error: true, latencyMs: Date.now() - startTime },
        });
      }

      throw error;
    }
  }

  /**
   * Apply HyDE (Hypothetical Document Embeddings) transformation
   */
  private async applyHyDE(query: string, trace: any): Promise<string> {
    try {
      const hydePrompt = formatPrompt(HYDE_PROMPT_TEMPLATE, { query });

      const response = await this.llmClient.complete({
        messages: [{ role: 'user', content: hydePrompt }],
        temperature: 0.3,
        maxTokens: 200,
      });

      if (trace) {
        trace.span({ name: 'hyde-transformation', input: query, output: response.content });
      }

      return response.content;
    } catch (error) {
      logger.warn('HyDE transformation failed, using original query', {
        error: error instanceof Error ? error.message : String(error),
      });
      return query;
    }
  }

  /**
   * Retrieve documents using hybrid search
   */
  private async retrieve(
    query: string,
    tenantId: string,
    trace: any
  ): Promise<Array<{ pageContent: string; metadata: Record<string, unknown> }>> {
    const retriever = await TenantIsolatedRetriever.create(tenantId);
    const documents = await retriever.retrieve(query);

    if (trace) {
      trace.span({
        name: 'retrieval',
        input: { query, topK: this.options.topK },
        output: { count: documents.length },
      });
    }

    return documents.slice(0, this.options.topK);
  }

  /**
   * Rerank documents using cross-encoder or LLM
   */
  private async rerank(
    query: string,
    documents: Array<{ pageContent: string; metadata: Record<string, unknown> }>,
    trace: any
  ): Promise<Array<{ pageContent: string; metadata: Record<string, unknown> }>> {
    // Use centralized reranking prompt
    const rerankPrompt = buildRerankingPrompt(
      query,
      documents.map((d, i) => ({ content: d.pageContent, index: i }))
    );

    try {
      const response = await this.llmClient.complete({
        messages: [{ role: 'user', content: rerankPrompt }],
        temperature: 0,
        maxTokens: 100,
      });

      const scores = JSON.parse(response.content);
      const ranked = documents
        .map((doc, idx) => ({ doc, score: scores[idx] ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .map(({ doc, score }) => ({
          ...doc,
          metadata: { ...doc.metadata, score },
        }));

      if (trace) {
        trace.span({ name: 'reranking', input: { docCount: documents.length }, output: { scores } });
      }

      return ranked;
    } catch (error) {
      logger.warn('Reranking failed, using original order', {
        error: error instanceof Error ? error.message : String(error),
      });
      return documents;
    }
  }

  /**
   * Generate answer using LLM with retrieved context
   */
  private async generateAnswer(
    query: string,
    documents: Array<{ pageContent: string; metadata: Record<string, unknown> }>,
    context: QueryContext,
    trace: any
  ): Promise<{ answer: string; tokensUsed: { prompt: number; completion: number; total: number } }> {
    const contextText = documents.map((d) => d.pageContent).join('\n\n---\n\n');
    
    // Use centralized prompts
    const userPrompt = buildRAGUserPrompt(query, contextText, context.conversationHistory);

    const response = await this.llmClient.complete({
      messages: [
        { role: 'system', content: RAG_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 1000,
    });

    if (trace) {
      trace.generation({
        name: 'answer-generation',
        model: response.model,
        input: userPrompt,
        output: response.content,
        usage: response.usage,
      });
    }

    return {
      answer: response.content,
      tokensUsed: {
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
        total: response.usage.totalTokens,
      },
    };
  }

  /**
   * Invalidate cache for a tenant
   */
  invalidateCache(tenantId: string): void {
    this.cache.invalidate(tenantId);
    logger.info('Cache invalidated', { tenantId });
  }
}

// --- Factory ---

let pipelineInstance: HybridQueryPipeline | null = null;

export function getHybridQueryPipeline(options?: PipelineOptions): HybridQueryPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new HybridQueryPipeline(options);
  }
  return pipelineInstance;
}

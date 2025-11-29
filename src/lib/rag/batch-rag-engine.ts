// Batch RAG Engine with Intelligent Aggregation
// See PRODUCTION_UPGRADE_PLAN.md Phase 2 for full implementation guidance

import pLimit from 'p-limit';
import { validateTenantId } from '../security/rag-guardrails';
import { TenantIsolatedRetriever } from './supabase-retriever-v2';
import { BatchRetriever } from './batch-retriever';
import { GroqClientWithBreaker } from './llm-client-with-breaker';
import { AuditLogger } from '../security/audit-logging';
import { enforceQuota } from '../trial/quota-enforcer';
import { logger } from '../observability/logger';

// Concurrency limits
const MAX_CONCURRENT_LLM_CALLS = 3;
const MAX_CONCURRENT_RETRIEVALS = 10;
const MAX_QUERIES_PER_BATCH = 10;
const MAX_AGGREGATED_QUERIES = 5;

export interface BatchQueryInput {
  query: string;
  metadata?: Record<string, any>;
  sessionId?: string;
}

export interface BatchQueryResult {
  query: string;
  answer: string;
  sources: Array<{ content: string; metadata: Record<string, any> }>;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  cached: boolean;
  error?: string;
}

export interface BatchRAGResponse {
  results: BatchQueryResult[];
  totalTokens: number;
  totalLatencyMs: number;
  aggregated: boolean;
}

export class BatchRAGEngine {
  private retriever: TenantIsolatedRetriever;
  private llmClient: GroqClientWithBreaker;
  private tenantId: string;
  private llmLimiter: ReturnType<typeof pLimit>;
  private batchRetriever: BatchRetriever;

  constructor(tenantId: string, retriever: TenantIsolatedRetriever, llmClient: GroqClientWithBreaker) {
    validateTenantId(tenantId);
    this.tenantId = tenantId;
    this.retriever = retriever;
    this.llmClient = llmClient;
    this.llmLimiter = pLimit(MAX_CONCURRENT_LLM_CALLS);
    this.batchRetriever = new BatchRetriever(this.retriever, {
      ttlMs: 120_000,
      concurrency: MAX_CONCURRENT_RETRIEVALS,
    });
  }

  async executeBatch(queries: BatchQueryInput[]): Promise<BatchRAGResponse> {
    const startTime = Date.now();
    if (queries.length === 0) throw new Error('Batch cannot be empty');
    if (queries.length > MAX_QUERIES_PER_BATCH) throw new Error(`Batch size ${queries.length} exceeds maximum ${MAX_QUERIES_PER_BATCH}`);
    logger.info('Batch RAG execution started', { tenantId: this.tenantId, queryCount: queries.length });
    const shouldAggregate = queries.length <= MAX_AGGREGATED_QUERIES && this.canAggregate(queries);
    let results: BatchQueryResult[];
    if (shouldAggregate) {
      results = await this.executeAggregated(queries);
    } else {
      results = await this.executeParallel(queries);
    }
    const totalTokens = results.reduce((sum, r) => sum + r.usage.totalTokens, 0);
    const totalLatencyMs = Date.now() - startTime;
    logger.info('Batch RAG execution completed', { tenantId: this.tenantId, queryCount: queries.length, totalTokens, totalLatencyMs, aggregated: shouldAggregate });
    return { results, totalTokens, totalLatencyMs, aggregated: shouldAggregate };
  }

  private canAggregate(queries: BatchQueryInput[]): boolean {
    const totalLength = queries.reduce((sum, q) => sum + q.query.length, 0);
    if (totalLength > 2000) return false;
    const sessionIds = new Set(queries.map((q) => q.sessionId).filter(Boolean));
    if (sessionIds.size > 1) return false;
    return true;
  }

  private async executeAggregated(queries: BatchQueryInput[]): Promise<BatchQueryResult[]> {
    const startTime = Date.now();
    const batchResults = await this.batchRetriever.retrieveBatch(
      queries.map((q) => ({ query: q.query }))
    );
    const contextByQuery = batchResults.map((result, idx) => ({
      query: queries[idx].query,
      context: result.documents.map((d) => d.pageContent).join('\n\n'),
      sources: result.documents.map((d) => ({ content: d.pageContent, metadata: d.metadata || {} })),
    }));
    const aggregatedPrompt = this.buildAggregatedPrompt(contextByQuery);
    const estimatedTokens = Math.ceil((aggregatedPrompt.length + queries.length * 200) / 4);
    const quotaCheck = await enforceQuota(this.tenantId, 'tokens', estimatedTokens);
    if (!quotaCheck.allowed) {
      throw new Error(`Quota exceeded: ${quotaCheck.tokens_remaining} tokens remaining`);
    }
    const llmResponse = await this.llmClient.complete({
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Answer each numbered question concisely and accurately based on the provided context.' },
        { role: 'user', content: aggregatedPrompt },
      ],
      temperature: 0.7,
      maxTokens: 2048,
    });
    const answers = this.parseAggregatedResponse(llmResponse.content, queries.length);
    const latencyMs = Date.now() - startTime;
    const results: BatchQueryResult[] = queries.map((q, idx) => {
      const tokensPerQuery = Math.ceil(llmResponse.usage.totalTokens / queries.length);
      const resultLatency = latencyMs / queries.length;
      void AuditLogger.logRagQuery(this.tenantId, q.query, {
        execution_time_ms: Math.round(resultLatency),
        result_count: batchResults[idx].documents.length,
        success: true,
      });
      return {
        query: q.query,
        answer: answers[idx],
        sources: contextByQuery[idx].sources,
        usage: {
          promptTokens: Math.ceil(llmResponse.usage.promptTokens / queries.length),
          completionTokens: Math.ceil(llmResponse.usage.completionTokens / queries.length),
          totalTokens: tokensPerQuery,
        },
        latencyMs: resultLatency,
        cached: batchResults[idx].cached,
      };
    });
    return results;
  }

  private async executeParallel(queries: BatchQueryInput[]): Promise<BatchQueryResult[]> {
    const promises = queries.map((q) => this.llmLimiter(() => this.executeSingleQuery(q)));
    return Promise.all(promises);
  }

  private async executeSingleQuery(query: BatchQueryInput): Promise<BatchQueryResult> {
    const startTime = Date.now();
    try {
      const retrievalResult = (await this.batchRetriever.retrieveBatch([{ query: query.query }]))[0];
      const docs = retrievalResult?.documents ?? [];
      const context = docs.map((d) => d.pageContent).join('\n\n');
      const estimatedTokens = Math.ceil((context.length + query.query.length + 200) / 4);
      const quotaCheck = await enforceQuota(this.tenantId, 'tokens', estimatedTokens);
      if (!quotaCheck.allowed) {
        throw new Error(`Quota exceeded for query: ${query.query.substring(0, 50)}...`);
      }
      const llmResponse = await this.llmClient.complete({
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Answer based on the provided context.' },
          { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query.query}` },
        ],
        temperature: 0.7,
        maxTokens: 4096,
      });
      const latencyMs = Date.now() - startTime;
      void AuditLogger.logRagQuery(this.tenantId, query.query, {
        execution_time_ms: latencyMs,
        result_count: docs.length,
        success: true,
      });
      return {
        query: query.query,
        answer: llmResponse.content,
        sources: docs.map((d) => ({ content: d.pageContent, metadata: d.metadata || {} })),
        usage: llmResponse.usage,
        latencyMs,
        cached: retrievalResult?.cached ?? false,
      };
    } catch (error) {
      logger.error('Single query execution failed', { tenantId: this.tenantId, query: query.query, error: error instanceof Error ? error.message : String(error) });
      void AuditLogger.logRagQuery(this.tenantId, query.query, {
        execution_time_ms: Date.now() - startTime,
        result_count: 0,
        success: false,
      });
      return {
        query: query.query,
        answer: '',
        sources: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: Date.now() - startTime,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildAggregatedPrompt(contextByQuery: Array<{ query: string; context: string }>): string {
    let prompt = 'Please answer the following questions based on the provided contexts:\n\n';
    contextByQuery.forEach((item, idx) => {
      prompt += `Question ${idx + 1}: ${item.query}\n`;
      prompt += `Context ${idx + 1}:\n${item.context}\n\n`;
    });
    prompt += 'Provide numbered answers (1, 2, 3, etc.) corresponding to each question.';
    return prompt;
  }

  private parseAggregatedResponse(response: string, expectedCount: number): string[] {
    const answers: string[] = [];
    const lines = response.split('\n');
    let currentAnswer = '';
    let currentNumber = 1;
    for (const line of lines) {
      const match = line.match(/^(\d+)[.)]\s*(.+)/);
      if (match) {
        if (currentAnswer) answers.push(currentAnswer.trim());
        currentNumber = parseInt(match[1]);
        currentAnswer = match[2];
      } else if (currentAnswer) {
        currentAnswer += ' ' + line;
      }
    }
    if (currentAnswer) answers.push(currentAnswer.trim());
    if (answers.length !== expectedCount) {
      const paragraphs = response.split('\n\n').filter((p) => p.trim());
      return paragraphs.slice(0, expectedCount);
    }
    return answers;
  }
}

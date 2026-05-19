import { Counter, Gauge, Histogram, collectDefaultMetrics, Registry } from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export type BreakerStateLabel = 'closed' | 'half_open' | 'open' | 'isolated';
const BREAKER_STATE_VALUE: Record<BreakerStateLabel, number> = {
  closed: 0,
  half_open: 1,
  open: 2,
  isolated: 3,
};

export const llmBreakerRequests = new Counter({
  name: 'llm_breaker_requests_total',
  help: 'Total Groq breaker executions',
  labelNames: ['model'],
  registers: [register],
});

export const llmBreakerSuccesses = new Counter({
  name: 'llm_breaker_successes_total',
  help: 'Total successful Groq breaker executions',
  labelNames: ['model'],
  registers: [register],
});

export const llmBreakerFailures = new Counter({
  name: 'llm_breaker_failures_total',
  help: 'Total failed Groq breaker executions',
  labelNames: ['model'],
  registers: [register],
});

export const llmBreakerStateGauge = new Gauge({
  name: 'llm_breaker_state',
  help: 'Numeric representation of the Groq circuit breaker state (0=closed, 1=half-open, 2=open, 3=isolated)',
  labelNames: ['model'],
  registers: [register],
});

export const chatApiCounter = new Counter({
  name: 'chat_api_requests_total',
  help: 'Total number of chat API requests',
  labelNames: ['route', 'method', 'status'],
  registers: [register],
});

export const chatApiLatency = new Histogram({
  name: 'chat_api_latency_seconds',
  help: 'Chat API latency in seconds',
  labelNames: ['route', 'method', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Queue metrics
export const queueJobsTotal = new Counter({
  name: 'queue_jobs_total',
  help: 'Total number of queue jobs',
  labelNames: ['queue', 'status'],
  registers: [register],
});

export const queueJobDuration = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Queue job duration in seconds',
  labelNames: ['queue', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

// RAG pipeline metrics
export const ragQueriesTotal = new Counter({
  name: 'rag_queries_total',
  help: 'Total number of RAG queries',
  labelNames: ['success'],
  registers: [register],
});

export const ragQueryLatency = new Histogram({
  name: 'rag_query_latency_seconds',
  help: 'RAG query latency in seconds',
  labelNames: ['success'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const ragChunksRetrieved = new Histogram({
  name: 'rag_chunks_retrieved',
  help: 'Number of chunks retrieved per RAG query',
  buckets: [1, 3, 5, 10, 20],
  registers: [register],
});

// Cache metrics
export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache'],
  registers: [register],
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache'],
  registers: [register],
});

// Streaming metrics
export const streamingTokensTotal = new Counter({
  name: 'streaming_tokens_total',
  help: 'Total number of tokens streamed',
  labelNames: ['route'],
  registers: [register],
});

export const streamingLatency = new Histogram({
  name: 'streaming_latency_seconds',
  help: 'Streaming latency in seconds',
  labelNames: ['route'],
  buckets: [0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Ingestion metrics
export const ingestionJobsTotal = new Counter({
  name: 'ingestion_jobs_total',
  help: 'Total number of ingestion jobs',
  labelNames: ['status'],
  registers: [register],
});

export const ingestionPagesProcessed = new Histogram({
  name: 'ingestion_pages_processed',
  help: 'Pages processed per ingestion job',
  buckets: [1, 5, 10, 25, 50, 100],
  registers: [register],
});

export const ingestionChunksCreated = new Histogram({
  name: 'ingestion_chunks_created',
  help: 'Chunks created per ingestion job',
  buckets: [10, 50, 100, 250, 500, 1000],
  registers: [register],
});

export const ragChunkingLatency = new Histogram({
  name: 'rag_chunking_latency_seconds',
  help: 'Chunking latency in seconds',
  labelNames: ['tenant_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const ragStoringLatency = new Histogram({
  name: 'rag_storing_latency_seconds',
  help: 'Vector storage latency in seconds',
  labelNames: ['tenant_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const ragPipelineStatus = new Counter({
  name: 'rag_pipeline_status_total',
  help: 'RAG pipeline completion status',
  labelNames: ['tenant_id', 'status'], // status: completed, failed
  registers: [register],
});

export const ragEmbeddingBatchLatency = new Histogram({
  name: 'rag_embedding_batch_latency_seconds',
  help: 'Latency of individual embedding batches',
  labelNames: ['model', 'batch_size'], // from config
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const ragVectorsGenerated = new Counter({
  name: 'rag_vectors_generated_total',
  help: 'Total number of vectors generated',
  labelNames: ['model', 'quantization'],
  registers: [register],
});

export const ragVectorsStored = new Counter({
  name: 'rag_vectors_stored_total',
  help: 'Total vectors stored per pipeline execution',
  labelNames: ['tenant_id'],
  registers: [register],
});

export const ragVectorStorageBatchLatency = new Histogram({
  name: 'rag_vector_storage_batch_latency_seconds',
  help: 'Latency of vector storage batch inserts',
  labelNames: ['tenant_id'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const ragVectorStorageTotalLatency = new Histogram({
  name: 'rag_vector_storage_total_latency_seconds',
  help: 'Total duration of vector storage operation',
  labelNames: ['tenant_id'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// ========================================================================
// Advanced RAG Pipeline Telemetry
// ========================================================================

// Embedding generation latency
export const ragEmbeddingLatency = new Histogram({
  name: 'rag_embedding_latency_seconds',
  help: 'Embedding generation latency in seconds',
  labelNames: ['model', 'batch_size'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

// Vector search latency (Supabase pgvector)
export const ragVectorSearchLatency = new Histogram({
  name: 'rag_vector_search_latency_seconds',
  help: 'Vector search latency in seconds',
  labelNames: ['tenant_id'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

// LLM completion latency
export const ragLLMLatency = new Histogram({
  name: 'rag_llm_latency_seconds',
  help: 'LLM completion latency in seconds',
  labelNames: ['model', 'streaming'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
  registers: [register],
});

// Time To First Token (TTFT) for streaming
export const ragTTFT = new Histogram({
  name: 'rag_ttft_seconds',
  help: 'Time to first token in seconds',
  labelNames: ['model'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 15],
  registers: [register],
});

// Context window utilization
export const ragContextTokens = new Histogram({
  name: 'rag_context_tokens',
  help: 'Number of context tokens sent to LLM',
  buckets: [100, 500, 1000, 2000, 4000, 8000, 16000],
  registers: [register],
});

// Retrieval recall (chunks after filtering)
export const ragRetrievalRecall = new Histogram({
  name: 'rag_retrieval_recall',
  help: 'Number of relevant chunks after filtering',
  buckets: [0, 1, 3, 5, 10, 20],
  registers: [register],
});

export function recordChatApiMetrics(route: string, method: string, status: number, latencyMs: number) {
  chatApiCounter.inc({ route, method, status });
  chatApiLatency.observe({ route, method, status }, latencyMs / 1000);
}

export function recordLLMBreakerRequest(model: string) {
  llmBreakerRequests.inc({ model });
}

export function recordLLMBreakerSuccess(model: string) {
  llmBreakerSuccesses.inc({ model });
}

export function recordLLMBreakerFailure(model: string) {
  llmBreakerFailures.inc({ model });
}

export function recordLLMBreakerState(model: string, state: BreakerStateLabel) {
  const value = BREAKER_STATE_VALUE[state];
  llmBreakerStateGauge.labels(model).set(value);
}

export function recordQueueJobMetrics(queue: string, status: 'queued' | 'processing' | 'completed' | 'failed', durationMs?: number) {
  queueJobsTotal.inc({ queue, status });
  if (durationMs !== undefined) {
    queueJobDuration.observe({ queue, status }, durationMs / 1000);
  }
}

export function recordRagQueryMetrics(success: boolean, latencyMs: number, chunks: number) {
  ragQueriesTotal.inc({ success: String(success) });
  ragQueryLatency.observe({ success: String(success) }, latencyMs / 1000);
  if (chunks > 0) {
    ragChunksRetrieved.observe(chunks);
  }
}

export function recordIngestionJobMetrics(status: 'started' | 'completed' | 'failed', chunks?: number, pages?: number) {
  ingestionJobsTotal.inc({ status });
  if (chunks !== undefined && chunks > 0) {
    ingestionChunksCreated.observe(chunks);
  }
  if (pages !== undefined && pages > 0) {
    ingestionPagesProcessed.observe(pages);
  }
}

export function recordCacheHit(cacheName: string) {
  try {
    cacheHitsTotal.inc({ cache: cacheName });
  } catch (_) { }
}

export function recordCacheMiss(cacheName: string) {
  try {
    cacheMissesTotal.inc({ cache: cacheName });
  } catch (_) { }
}

export function recordStreamingTokens(route: string, tokens: number) {
  try {
    streamingTokensTotal.inc({ route }, tokens);
  } catch (_) { }
}

export function observeStreamingLatency(route: string, latencyMs: number) {
  try {
    streamingLatency.observe({ route }, latencyMs / 1000);
  } catch (_) { }
}

// ========================================================================
// Advanced RAG Telemetry Helper Functions
// ========================================================================

export function recordRagEmbeddingLatency(model: string, batchSize: number, latencyMs: number) {
  try {
    ragEmbeddingLatency.observe({ model, batch_size: String(batchSize) }, latencyMs / 1000);
  } catch (_) { }
}

export function recordRagVectorSearchLatency(tenantId: string, latencyMs: number) {
  try {
    ragVectorSearchLatency.observe({ tenant_id: tenantId }, latencyMs / 1000);
  } catch (_) { }
}

export function recordRagLLMLatency(model: string, streaming: boolean, latencyMs: number) {
  try {
    ragLLMLatency.observe({ model, streaming: String(streaming) }, latencyMs / 1000);
  } catch (_) { }
}

export function recordRagTTFT(model: string, ttftMs: number) {
  try {
    ragTTFT.observe({ model }, ttftMs / 1000);
  } catch (_) { }
}

export function recordRagContextTokens(tokens: number) {
  try {
    ragContextTokens.observe(tokens);
  } catch (_) { }
}

export function recordRagRetrievalRecall(chunks: number) {
  try {
    ragRetrievalRecall.observe(chunks);
  } catch (_) { }
}

export function getMetrics() {
  return register.metrics();
}

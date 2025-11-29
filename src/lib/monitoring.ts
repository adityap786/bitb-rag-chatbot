// Monitoring and metrics instrumentation for BiTB RAG chatbot
// Exposes Prometheus-compatible metrics endpoint and in-process counters

import { TrialLogger } from './trial/logger';

interface Metric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  value: number;
  labels?: Record<string, string>;
}

const metrics: Record<string, Metric> = {};

export function incrementMetric(name: string, help: string, labels?: Record<string, string>) {
  if (!metrics[name]) {
    metrics[name] = { name, help, type: 'counter', value: 0, labels };
  }
  metrics[name].value++;
}

export function observeLatency(name: string, ms: number, help: string, labels?: Record<string, string>) {
  if (!metrics[name]) {
    metrics[name] = { name, help, type: 'histogram', value: ms, labels };
  } else {
    // Simple average for demo; use buckets for real histogram
    metrics[name].value = (metrics[name].value + ms) / 2;
  }
}

export function getMetrics(): string {
  // Prometheus exposition format
  return Object.values(metrics)
    .map(m => {
      const labelStr = m.labels ? '{' + Object.entries(m.labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}' : '';
      return `# HELP ${m.name} ${m.help}\n# TYPE ${m.name} ${m.type}\n${m.name}${labelStr} ${m.value}`;
    })
    .join('\n');
}

// Example: instrument API endpoint
export function recordApiCall(path: string, status: number, latencyMs: number) {
  incrementMetric('api_calls_total', 'Total API calls', { path, status: String(status) });
  observeLatency('api_latency_ms', latencyMs, 'API response latency (ms)', { path });
  if (status >= 400) {
    incrementMetric('api_errors_total', 'Total API errors', { path, status: String(status) });
  }
  TrialLogger.info('API metrics', { path, status, latencyMs });
}

// Usage: call recordApiCall in each endpoint handler

// Queue metrics
export function recordQueueJob(queueName: string, status: 'queued' | 'processing' | 'completed' | 'failed', durationMs?: number) {
  incrementMetric('queue_jobs_total', 'Total queue jobs', { queue: queueName, status });
  if (durationMs !== undefined) {
    observeLatency('queue_job_duration_ms', durationMs, 'Queue job duration (ms)', { queue: queueName, status });
  }
}

// RAG pipeline metrics
export function recordRagQuery(success: boolean, latencyMs: number, chunks: number) {
  incrementMetric('rag_queries_total', 'Total RAG queries', { success: String(success) });
  observeLatency('rag_query_latency_ms', latencyMs, 'RAG query latency (ms)', { success: String(success) });
  if (chunks > 0) {
    observeLatency('rag_chunks_retrieved', chunks, 'Number of chunks retrieved per query', {});
  }
}

export function recordIngestionJob(status: 'started' | 'completed' | 'failed', chunks?: number, pages?: number) {
  incrementMetric('ingestion_jobs_total', 'Total ingestion jobs', { status });
  if (chunks !== undefined && chunks > 0) {
    observeLatency('ingestion_chunks_created', chunks, 'Chunks created per ingestion', {});
  }
  if (pages !== undefined && pages > 0) {
    observeLatency('ingestion_pages_processed', pages, 'Pages processed per ingestion', {});
  }
}

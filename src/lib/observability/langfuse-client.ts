/**
 * Langfuse Client Helper
 * Lazy-loaded Langfuse client for tracing RAG operations
 * 
 * To enable Langfuse tracing:
 * 1. Install: npm install langfuse
 * 2. Set environment variables: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST
 */

interface LangfuseTraceData {
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  [key: string]: unknown;
}

interface LangfuseTrace {
  id: string;
  update(data: LangfuseTraceData): void;
  span(data: Record<string, unknown>): LangfuseTrace;
  generation(data: Record<string, unknown>): LangfuseTrace;
  event(data: Record<string, unknown>): void;
}

interface LangfuseTraceInit {
  name: string;
  id?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  [key: string]: unknown;
}

interface LangfuseClient {
  trace(data: LangfuseTraceInit): LangfuseTrace;
  flushAsync(): Promise<void>;
}


let langfuseClient: LangfuseClient | null = null;
let initAttempted = false;

// Buffer for trace events if client is not ready or network fails
const traceBuffer: Array<{ method: string, args: any[] }> = [];
let bufferFlushInterval: NodeJS.Timeout | null = null;

function flushTraceBuffer() {
  if (!langfuseClient) return;
  while (traceBuffer.length > 0) {
    const { method, args } = traceBuffer.shift()!;
    try {
      // @ts-ignore
      langfuseClient[method](...args);
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('Langfuse trace buffer flush failed', err);
      // Optionally re-buffer or drop
    }
  }
}

function bufferTraceEvent(method: string, ...args: any[]) {
  traceBuffer.push({ method, args });
  // Try to flush every 10s if not already
  if (!bufferFlushInterval) {
    bufferFlushInterval = setInterval(flushTraceBuffer, 10000);
  }
}

// Example usage: bufferTraceEvent('trace', { name: 'my-trace' })

export function getLangfuseClient(): LangfuseClient | null {
  if (initAttempted) {
    return langfuseClient;
  }

  initAttempted = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST;

  if (!publicKey || !secretKey) {
    console.warn('[Langfuse] Missing credentials. Tracing disabled. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable.');
    return null;
  }

  try {
    // Dynamic import to avoid hard dependency
    const { Langfuse } = require('langfuse');
    langfuseClient = new Langfuse({
      publicKey,
      secretKey,
      baseUrl: host,
      flushAt: 1, // Flush immediately for testing; increase for production
    });
    console.info('[Langfuse] Client initialized');
    return langfuseClient;
  } catch (error) {
    console.warn('[Langfuse] SDK not installed or initialization failed. Run: npm install langfuse');
    return null;
  }
}

/**
 * Create a trace for an ingestion job
 */
export function createIngestionTrace(
  jobId: string,
  tenantId: string,
  dataSource: { type: string; [key: string]: unknown }
): LangfuseTrace | null {
  const client = getLangfuseClient();
  if (!client) return null;

  try {
    return client.trace({
      name: 'ingestion-job',
      id: jobId,
      metadata: {
        tenant_id: tenantId,
        data_source_type: dataSource.type,
      },
    });
  } catch (error) {
    console.error('[Langfuse] Failed to create trace:', error);
    return null;
  }
}

/**
 * Create a trace for a RAG query
 */
export function createRagQueryTrace(
  queryId: string,
  tenantId: string,
  query: string
): LangfuseTrace | null {
  // Allow tests to inject a mock Langfuse client via globalThis.__langfuse_client_override
  const override = (globalThis as any).__langfuse_client_override as LangfuseClient | undefined;
  if (override) {
    try {
      return override.trace({
        name: 'rag-query',
        id: queryId,
        metadata: {
          tenant_id: tenantId,
          query_length: query.length,
        },
      });
    } catch (error) {
      console.error('[Langfuse] Test override trace creation failed:', error);
      return null;
    }
  }

  const client = getLangfuseClient();
  if (!client) return null;

  try {
    return client.trace({
      name: 'rag-query',
      id: queryId,
      metadata: {
        tenant_id: tenantId,
        query_length: query.length,
      },
    });
  } catch (error) {
    console.error('[Langfuse] Failed to create trace:', error);
    return null;
  }
}

// Alias for backward compatibility
export const createRAGQueryTrace = createRagQueryTrace;

/**
 * Update a RAG query trace with output and metadata
 */
export function updateRAGQueryTrace(
  trace: LangfuseTrace | null,
  data: { output?: Record<string, unknown>; metadata?: Record<string, unknown>; tags?: string[] }
): void {
  if (!trace) return;
  try {
    trace.update(data);
  } catch (error) {
    console.warn('[Langfuse] Failed to update trace:', error);
  }
}

/**
 * Flush pending events (call on shutdown)
 */
export async function flushLangfuse() {
  const client = getLangfuseClient();
  if (client) {
    try {
      await client.flushAsync();
    } catch (error) {
      console.error('[Langfuse] Failed to flush:', error);
    }
  }
}

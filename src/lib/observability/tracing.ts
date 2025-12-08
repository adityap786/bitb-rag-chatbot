/**
 * OpenTelemetry Distributed Tracing Setup
 * 
 * Provides distributed tracing for the RAG pipeline with:
 * - Automatic instrumentation for HTTP, database, and LLM calls
 * - Custom spans for RAG-specific operations
 * - Trace propagation across services
 * - Export to OTLP-compatible backends (Jaeger, Zipkin, etc.)
 * 
 * This module uses dynamic imports and gracefully degrades if OpenTelemetry
 * packages are not installed. Install dependencies for full tracing:
 * npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
 *   @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources \
 *   @opentelemetry/semantic-conventions @opentelemetry/api
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

import { logger } from './logger';

// Service configuration
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'bitb-rag-chatbot';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';
const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

// Check if tracing is enabled
const TRACING_ENABLED = process.env.OTEL_SDK_DISABLED !== 'true' && 
                        process.env.OPENTELEMETRY_SDK_DISABLED !== 'true';

// OpenTelemetry types (optional dependency)
interface OtelSpan {
  end(): void;
  setStatus(status: { code: number; message?: string }): void;
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(exception: Error): void;
}

interface OtelTracer {
  startSpan(name: string, options?: { attributes?: Record<string, string | number | boolean> }): OtelSpan;
}

let sdk: any = null;
let isInitialized = false;
let otelApi: any = null;

// Status codes
export const SpanStatusCode = {
  OK: 1,
  ERROR: 2,
} as const;

/**
 * Initialize OpenTelemetry SDK (lazy loading)
 */
export async function initTracing(): Promise<void> {
  if (isInitialized || !TRACING_ENABLED) {
    if (!TRACING_ENABLED) {
      logger.info('OpenTelemetry tracing disabled via environment variable');
    }
    return;
  }

  try {
    // Dynamically import OpenTelemetry packages (optional dependency)
    // @ts-ignore - optional dependency
    const sdkModule = await import('@opentelemetry/sdk-node');
    // @ts-ignore - optional dependency  
    const autoModule = await import('@opentelemetry/auto-instrumentations-node');
    // @ts-ignore - optional dependency
    const exporterModule = await import('@opentelemetry/exporter-trace-otlp-http');
    // @ts-ignore - optional dependency
    const resourcesModule = await import('@opentelemetry/resources');
    // @ts-ignore - optional dependency
    const conventionsModule = await import('@opentelemetry/semantic-conventions');
    // @ts-ignore - optional dependency
    const api = await import('@opentelemetry/api');

    const { NodeSDK } = sdkModule;
    const { getNodeAutoInstrumentations } = autoModule;
    const { OTLPTraceExporter } = exporterModule;
    const { Resource } = resourcesModule;
    const { SemanticResourceAttributes } = conventionsModule;

    otelApi = api;

    const exporter = new OTLPTraceExporter({
      url: OTEL_ENDPOINT,
    });

    sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
        [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
        'deployment.environment': process.env.NODE_ENV || 'development',
      }),
      traceExporter: exporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-pg': { enabled: true },
        }),
      ],
    });

    sdk.start();
    isInitialized = true;
    logger.info('OpenTelemetry tracing initialized', { serviceName: SERVICE_NAME, endpoint: OTEL_ENDPOINT });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk?.shutdown()
        .then(() => logger.info('OpenTelemetry SDK shut down'))
        .catch((err: Error) => logger.error('Error shutting down OpenTelemetry SDK', { error: err.message }));
    });
  } catch (error) {
    logger.warn('OpenTelemetry packages not installed. Tracing disabled. Run: npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/api');
  }
}

/**
 * Get the tracer for RAG operations
 */
export function getTracer(): OtelTracer | null {
  if (!otelApi) return null;
  return otelApi.trace.getTracer('rag-pipeline', SERVICE_VERSION);
}

/**
 * Create a no-op span for when tracing is disabled
 */
function createNoopSpan(): OtelSpan {
  return {
    end: () => {},
    setStatus: () => {},
    setAttribute: () => {},
    recordException: () => {},
  };
}

/**
 * Create a span for a RAG query
 */
export function createQuerySpan(
  operationName: string,
  attributes: Record<string, string | number | boolean>
): OtelSpan {
  const tracer = getTracer();
  if (!tracer) return createNoopSpan();
  
  return tracer.startSpan(operationName, {
    attributes: {
      'rag.operation': operationName,
      ...attributes,
    },
  });
}

/**
 * Wrap an async function with tracing
 */
export async function withSpan<T>(
  operationName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: OtelSpan) => Promise<T>
): Promise<T> {
  if (!TRACING_ENABLED || !otelApi) {
    return fn(createNoopSpan());
  }

  const tracer = getTracer();
  if (!tracer) return fn(createNoopSpan());

  const span = tracer.startSpan(operationName, {
    attributes: {
      'rag.operation': operationName,
      ...attributes,
    },
  });

  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Trace a retrieval operation
 */
export async function traceRetrieval<T>(
  tenantId: string,
  query: string,
  fn: (span: OtelSpan) => Promise<T>
): Promise<T> {
  return withSpan('rag.retrieval', {
    'rag.tenant_id': tenantId,
    'rag.query_length': query.length,
  }, fn);
}

/**
 * Trace an embedding generation operation
 */
export async function traceEmbedding<T>(
  tenantId: string,
  textCount: number,
  fn: (span: OtelSpan) => Promise<T>
): Promise<T> {
  return withSpan('rag.embedding', {
    'rag.tenant_id': tenantId,
    'rag.text_count': textCount,
  }, fn);
}

/**
 * Trace an LLM generation operation
 */
export async function traceLLMGeneration<T>(
  model: string,
  promptTokens: number,
  fn: (span: OtelSpan) => Promise<T>
): Promise<T> {
  return withSpan('rag.llm_generation', {
    'llm.model': model,
    'llm.prompt_tokens': promptTokens,
  }, fn);
}

/**
 * Trace a reranking operation
 */
export async function traceReranking<T>(
  docCount: number,
  fn: (span: OtelSpan) => Promise<T>
): Promise<T> {
  return withSpan('rag.reranking', {
    'rag.document_count': docCount,
  }, fn);
}

/**
 * Trace an ingestion operation
 */
export async function traceIngestion<T>(
  tenantId: string,
  documentCount: number,
  fn: (span: OtelSpan) => Promise<T>
): Promise<T> {
  return withSpan('rag.ingestion', {
    'rag.tenant_id': tenantId,
    'rag.document_count': documentCount,
  }, fn);
}

/**
 * Extract trace context for propagation
 */
export function extractTraceContext(): Record<string, string> {
  if (!otelApi) return {};
  const carrier: Record<string, string> = {};
  otelApi.propagation.inject(otelApi.context.active(), carrier);
  return carrier;
}

/**
 * Shutdown tracing (call on app shutdown)
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    logger.info('OpenTelemetry tracing shut down');
  }
}

// Export Span type for consumers
export type Span = OtelSpan;

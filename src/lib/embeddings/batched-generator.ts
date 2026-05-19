import axios from 'axios';
import { ExternalServiceError } from '../trial/errors';
import { EMBEDDING_CONFIG } from './config';
// import { metrics } from '../telemetry'; // Deprecated
import { ragEmbeddingBatchLatency, ragVectorsGenerated } from '../monitoring/metrics';
import { circuitBreaker, ConsecutiveBreaker, handleAll, wrap, retry, ExponentialBackoff } from 'cockatiel';
import { logger } from '../observability/logger';

// Circuit Breaker & Retry Policies
// Break after 5 consecutive failures, reset after 10 seconds
const breakerPolicy = circuitBreaker(handleAll, {
  halfOpenAfter: 10000,
  breaker: new ConsecutiveBreaker(5),
});

// Exponential backoff retry: 3 attempts, starting at 500ms
const retryPolicy = retry(handleAll, {
  maxAttempts: 3,
  backoff: new ExponentialBackoff({ initialDelay: 500 }),
});

// Combined policy: Retry first, then check breaker
const resiliencePolicy = wrap(retryPolicy, breakerPolicy);

/**
 * Quantize fp32 embeddings to int8
 * Maps [-1, 1] to [-127, 127]
 */
export function quantizeToInt8(embeddings: number[][]): Int8Array[] {
  return embeddings.map((embedding) => {
    const quantized = new Int8Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
      // Clamp to [-1, 1] and scale to int8 range
      const clamped = Math.max(-1, Math.min(1, embedding[i]));
      quantized[i] = Math.round(clamped * 127);
    }
    return quantized;
  });
}

/**
 * Dequantize int8 back to fp32 (for queries)
 */
export function dequantizeFromInt8(quantized: Int8Array): number[] {
  const fp32 = new Array(quantized.length);
  for (let i = 0; i < quantized.length; i++) {
    fp32[i] = quantized[i] / 127.0;
  }
  return fp32;
}

/**
 * Batch embeddings into chunks for API calls
 */
function batchTexts<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Generate embeddings from a single batch with circuit breaker
 */
async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const startTime = Date.now();

  return resiliencePolicy.execute(async (context: { attempt: number }) => {
    const isRetry = context.attempt > 0;
    if (isRetry) logger.warn('Retrying embedding generation batch...');

    try {
      const response = await axios.post(
        `${EMBEDDING_CONFIG.SERVICE_URL}/embed-batch`,
        { texts },
        { timeout: EMBEDDING_CONFIG.TIMEOUT_MS }
      );

      if (!Array.isArray(response.data.embeddings)) {
        throw new Error('Invalid embedding response format');
      }

      const duration = Date.now() - startTime;
      ragEmbeddingBatchLatency.observe({ model: 'default', batch_size: String(texts.length) }, duration / 1000);
      ragVectorsGenerated.inc({ model: 'default', quantization: 'fp32' }, texts.length);

      return response.data.embeddings;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        // Circuit breaker will catch this
        throw new Error(`Embedding Service unavailable: ${error.message}`);
      }
      throw error;
    }
  });
}

/**
 * Generate embeddings with batching and parallelization
 * Uses Promise.allSettled for reliability
 */
export async function generateEmbeddingsBatched(
  texts: string[],
  options?: {
    batchSize?: number;
    maxParallel?: number;
    quantize?: boolean; // Defaults to FALSE (fp32) for safety unless explicitly requested
  }
): Promise<number[][] | Int8Array[]> {
  if (texts.length === 0) return [];

  const batchSize = options?.batchSize ?? EMBEDDING_CONFIG.BATCH_SIZE;
  const maxParallel = options?.maxParallel ?? EMBEDDING_CONFIG.MAX_PARALLEL;
  const shouldQuantize = options?.quantize ?? false;

  const batches = batchTexts(texts, batchSize);

  const allResults: number[][] = [];
  // const errors: Error[] = [];

  try {
    // Process batches in parallel (up to maxParallel)
    for (let i = 0; i < batches.length; i += maxParallel) {
      const parallelBatches = batches.slice(i, i + maxParallel);

      const results = await Promise.allSettled(
        parallelBatches.map(batch => generateEmbeddingBatch(batch))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value);
        } else {
          logger.error('Embedding batch failed', { error: result.reason });
          throw result.reason;
        }
      }
    }

    // Quantize if configured
    if (shouldQuantize) {
      ragVectorsGenerated.inc({ model: 'default', quantization: 'int8' }, texts.length);
      return quantizeToInt8(allResults);
    }

    return allResults;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Legacy compatibility wrapper
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const result = await generateEmbeddingsBatched(texts);

  // If quantized, we need to dequantize for legacy compatibility
  if (result.length > 0 && result[0] instanceof Int8Array) {
    return (result as Int8Array[]).map(dequantizeFromInt8);
  }

  return result as number[][];
}

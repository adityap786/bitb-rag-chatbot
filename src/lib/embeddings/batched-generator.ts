import axios from 'axios';
import { ExternalServiceError } from '../trial/errors';
import { EMBEDDING_CONFIG } from './config';
import { metrics } from '../telemetry';

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
 * Convert fp32 array to Buffer for binary transport
 */
export function fp32ToBuffer(embedding: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

/**
 * Convert int8 array to Buffer
 */
export function int8ToBuffer(embedding: Int8Array): Buffer {
  return Buffer.from(embedding);
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
 * Retry wrapper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = EMBEDDING_CONFIG.MAX_RETRIES,
  delayMs: number = EMBEDDING_CONFIG.RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Generate embeddings from a single batch
 */
async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      `${EMBEDDING_CONFIG.SERVICE_URL}/embed-batch`,
      { texts },
      { timeout: EMBEDDING_CONFIG.TIMEOUT_MS }
    );

    if (!Array.isArray(response.data.embeddings)) {
      throw new Error('Invalid response format');
    }

    const duration = Date.now() - startTime;
    metrics.timing('embedding.batch.duration', duration, {
      batchSize: texts.length.toString(),
    });
    metrics.counter('embedding.vectors.generated', texts.length);

    return response.data.embeddings;
  } catch (error: any) {
    metrics.error('embedding.batch.error', error);
    throw new ExternalServiceError('Embedding Service', error.message);
  }
}

/**
 * Generate embeddings with batching and parallelization
 * 
 * @param texts - Array of text strings to embed
 * @param options - Configuration overrides
 * @returns Array of embeddings (fp32 or quantized based on config)
 */
export async function generateEmbeddingsBatched(
  texts: string[],
  options?: {
    batchSize?: number;
    maxParallel?: number;
    quantize?: boolean;
  }
): Promise<number[][] | Int8Array[]> {
  if (texts.length === 0) return [];

  const batchSize = options?.batchSize ?? EMBEDDING_CONFIG.BATCH_SIZE;
  const maxParallel = options?.maxParallel ?? EMBEDDING_CONFIG.MAX_PARALLEL;
  const shouldQuantize = options?.quantize ?? (EMBEDDING_CONFIG.QUANTIZATION === 'int8');

  const startTime = Date.now();
  const batches = batchTexts(texts, batchSize);

  metrics.counter('embedding.request.started', 1, {
    totalTexts: texts.length.toString(),
    numBatches: batches.length.toString(),
  });

  try {
    // Process batches in parallel (up to maxParallel)
    const results: number[][] = [];
    
    for (let i = 0; i < batches.length; i += maxParallel) {
      const parallelBatches = batches.slice(i, i + maxParallel);
      const batchPromises = parallelBatches.map((batch) =>
        retryWithBackoff(() => generateEmbeddingBatch(batch))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());
    }

    const totalDuration = Date.now() - startTime;
    metrics.timing('embedding.request.total', totalDuration, {
      totalTexts: texts.length.toString(),
      throughput: (texts.length / (totalDuration / 1000)).toFixed(2),
    });

    // Quantize if configured
    if (shouldQuantize) {
      metrics.counter('embedding.quantization.applied', texts.length);
      return quantizeToInt8(results);
    }

    return results;
  } catch (error: any) {
    metrics.error('embedding.request.failed', error, {
      totalTexts: texts.length.toString(),
    });
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

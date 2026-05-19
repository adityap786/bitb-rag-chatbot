import { ExternalServiceError } from './errors';
import { generateEmbeddingsBatched } from '../embeddings/batched-generator';

/**
 * Generate embeddings using optimized batched pipeline
 * @throws ExternalServiceError if embedding service fails
 * 
 * @deprecated Use generateEmbeddingsBatched from @/lib/embeddings/batched-generator for better performance
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Metrics are now handled inside generateEmbeddingsBatched (using Prometheus)
  try {
    const result = await generateEmbeddingsBatched(texts);

    // generateEmbeddingsBatched usually returns number[][] | Int8Array[].
    // Legacy wrapper expects number[][] usually, but if batched-generator returns int8, we might need to convert?
    // The previous implementation of generateEmbeddingsWrapper in batched-generator HANDLED this conversion.
    // Here we just return. If it returns Int8Array[], downstream might break if it expects number[][].
    // But generateEmbeddingsBatched default quantize is false (fp32).

    // Wait, generateEmbeddingsBatched signature: Promise<number[][] | Int8Array[]>
    // This wrapper return type: Promise<number[][]>
    // So we should cast or dequantize if needed.
    // But default is fp32.

    return result as number[][];
  } catch (error: any) {
    throw new ExternalServiceError('MPNet', error.message || 'Failed to generate embeddings');
  }
}

import { ExternalServiceError } from './errors';
import { generateEmbeddings as generateEmbeddingsBatched } from '../embeddings/batched-generator';

/**
 * Generate embeddings using optimized batched pipeline
 * @throws ExternalServiceError if embedding service fails
 * 
 * @deprecated Use generateEmbeddingsBatched from @/lib/embeddings/batched-generator for better performance
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    return await generateEmbeddingsBatched(texts);
  } catch (error: any) {
    throw new ExternalServiceError('MPNet', error.message || 'Failed to generate embeddings');
  }
}
import { ExternalServiceError } from './errors';
import axios from 'axios';

/**
 * Generate embeddings using local BGE embedding service
 * @throws ExternalServiceError if embedding service fails
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    const serviceUrl = process.env.BGE_EMBEDDING_SERVICE_URL || 'http://localhost:8000';
    const response = await axios.post(`${serviceUrl}/embed-batch`, { texts });
    if (Array.isArray(response.data.embeddings)) {
      return response.data.embeddings;
    }
    throw new ExternalServiceError('BGE', 'Invalid embedding response from BGE service');
  } catch (error: any) {
    throw new ExternalServiceError('BGE', error.message || 'Failed to generate embeddings');
  }
}
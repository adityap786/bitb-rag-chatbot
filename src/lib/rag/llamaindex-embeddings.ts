import { logger } from '../observability/logger';

/**
 * Production-Grade Embedding Service using Transformers.js
 * 
 * Runs HuggingFace models directly in Node.js - no external API needed!
 * Model: nomic-ai/nomic-embed-text-v1.5 (768 dims) - optimized for quality
 * 
 * Features:
 * - Local execution (no network latency, no API limits)
 * - ONNX runtime for fast inference
 * - Automatic model caching
 * - Batch processing support
 * - Scales with your compute (CPU/GPU)
 * 
 * Only 768-dim model supported: nomic-ai/nomic-embed-text-v1.5
 */

// Lazy import to avoid blocking startup
let pipeline: any = null;
let extractor: any = null;

const MODEL_NAME = 'nomic-ai/nomic-embed-text-v1.5';
const EMBEDDING_DIM = 768;

async function getExtractor() {
  if (!extractor) {
    if (!pipeline) {
      // Dynamic import for Transformers.js
      const transformers = await import('@xenova/transformers');
      pipeline = transformers.pipeline;
    }
    
    logger.info('Loading embedding model', { model: MODEL_NAME });
    extractor = await pipeline('feature-extraction', MODEL_NAME, {
      quantized: true, // Use quantized model for faster inference
    });
    logger.info('Embedding model loaded', { model: MODEL_NAME });
  }
  return extractor;
}

export class LlamaIndexEmbeddingService {
  private static instance: LlamaIndexEmbeddingService | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): LlamaIndexEmbeddingService {
    if (!LlamaIndexEmbeddingService.instance) {
      LlamaIndexEmbeddingService.instance = new LlamaIndexEmbeddingService();
    }
    return LlamaIndexEmbeddingService.instance;
  }

  /**
   * Initialize the model (called lazily on first use)
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await getExtractor();
        this.isInitialized = true;
      })();
    }
    
    await this.initPromise;
  }

  /**
   * Embed a single string, returns a float array (768 dims)
   */
  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  /**
   * Embed a batch of strings
   * Returns an array of float arrays (768 dims each)
   * Optimized for batch processing
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    try {
      await this.initialize();
      const ext = await getExtractor();

      const embeddings: number[][] = [];
      
      // Process in batches of 32 for memory efficiency
      const batchSize = 32;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        for (const text of batch) {
          // Get embeddings with mean pooling
          const output = await ext(text, { 
            pooling: 'mean', 
            normalize: true 
          });
          
          // Convert to array
          const embedding = Array.from(output.data as Float32Array);
          embeddings.push(embedding.slice(0, EMBEDDING_DIM));
        }
      }

      logger.debug('Generated embeddings', { 
        count: embeddings.length, 
        dims: embeddings[0]?.length 
      });

      return embeddings;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Embedding generation failed', { error: errorMsg, textCount: texts.length });
      throw new Error(`Embedding failed: ${errorMsg}`);
    }
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return EMBEDDING_DIM;
  }
}

/**
 * Feature flag check for LlamaIndex embedding usage
 */
export function useLlamaIndexEmbeddings(): boolean {
  return process.env.USE_LLAMAINDEX_EMBEDDINGS === 'true';
}

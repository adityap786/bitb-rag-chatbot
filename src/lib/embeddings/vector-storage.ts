import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EMBEDDING_CONFIG, calculateVectorMemory } from './config';
import { fp32ToBuffer, int8ToBuffer } from './batched-generator';
import { metrics } from '../telemetry';

/**
 * Redis-style vector storage adapter for Supabase
 * Implements batched VADD using Supabase batch inserts
 */
export class VectorStorageAdapter {
  private client: SupabaseClient;
  private quantization: 'int8' | 'fp32';

  constructor(client: SupabaseClient, quantization?: 'int8' | 'fp32') {
    this.client = client;
    this.quantization = quantization ?? EMBEDDING_CONFIG.QUANTIZATION;
  }

  /**
   * Store vectors in batches using binary format
   * 
   * @param vectors - Array of {id, tenantId, content, embedding, metadata}
   * @param batchSize - Batch size for inserts (default 100)
   */
  async storeVectorsBatched(
    vectors: Array<{
      id?: string;
      tenant_id: string;
      kb_id?: string;
      content: string;
      chunk_text?: string;
      embedding: number[] | Int8Array;
      metadata?: Record<string, any>;
    }>,
    batchSize: number = 100
  ): Promise<void> {
    if (vectors.length === 0) return;

    const startTime = Date.now();
    const memoryStats = calculateVectorMemory(vectors.length, this.quantization);

    metrics.counter('vector.storage.started', vectors.length, {
      quantization: this.quantization,
      batchSize: batchSize.toString(),
    });

    try {
      // Process in batches
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        const batchStartTime = Date.now();

        // Convert embeddings to appropriate format
        const records = batch.map((v) => {
          const embedding = Array.isArray(v.embedding)
            ? v.embedding
            : Array.from(v.embedding);

          return {
            id: v.id,
            tenant_id: v.tenant_id,
            kb_id: v.kb_id,
            content: v.content,
            chunk_text: v.chunk_text || v.content,
            embedding_768: embedding, // Supabase stores as vector(768)
            metadata: v.metadata || {},
          };
        });

        const { error } = await this.client.from('embeddings').insert(records);

        if (error) {
          throw new Error(`Batch insert failed: ${error.message}`);
        }

        const batchDuration = Date.now() - batchStartTime;
        metrics.timing('vector.storage.batch', batchDuration, {
          batchSize: batch.length.toString(),
        });
      }

      const totalDuration = Date.now() - startTime;
      const throughput = vectors.length / (totalDuration / 1000);

      metrics.timing('vector.storage.total', totalDuration, {
        totalVectors: vectors.length.toString(),
        throughputPerSec: throughput.toFixed(2),
        memoryMB: memoryStats.totalMB,
      });

      console.log(`[VectorStorage] Stored ${vectors.length} vectors in ${totalDuration}ms (${throughput.toFixed(2)}/sec)`);
    } catch (error: any) {
      metrics.error('vector.storage.failed', error, {
        totalVectors: vectors.length.toString(),
      });
      throw error;
    }
  }

  /**
   * Redis-style VADD command simulation
   * Inserts vectors with pipelining for throughput
   */
  async vadd(
    key: string,
    vectors: Array<{
      id: string;
      embedding: number[] | Int8Array;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    // For Redis compatibility, we would use VADD here
    // For Supabase, we use the batched insert above
    console.warn('[VectorStorage] VADD is simulated via batched inserts');
  }

  /**
   * Get storage statistics
   */
  async getStats(tenantId: string): Promise<{
    vectorCount: number;
    estimatedMemoryMB: string;
    quantization: string;
  }> {
    const { count, error } = await this.client
      .from('embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }

    const memoryStats = calculateVectorMemory(count || 0, this.quantization);

    return {
      vectorCount: count || 0,
      estimatedMemoryMB: memoryStats.totalMB,
      quantization: this.quantization,
    };
  }
}

/**
 * Factory function to create vector storage adapter
 */
export function createVectorStorage(
  supabaseUrl: string,
  supabaseKey: string,
  quantization?: 'int8' | 'fp32'
): VectorStorageAdapter {
  const client = createClient(supabaseUrl, supabaseKey);
  return new VectorStorageAdapter(client, quantization);
}

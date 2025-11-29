// SupabaseVectorStore: Implements VectorStore for Supabase pgvector
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { VectorStore } from './retrieval-pipeline';
import { logger } from '../observability/logger';
import { metrics, timeAsync } from '../observability/metrics';
import crypto from 'crypto';

export interface SupabaseVectorStoreOptions {
  supabaseUrl: string;
  supabaseKey: string;
  tableName?: string; // default: 'vector_documents'
}

export class SupabaseVectorStore implements VectorStore {
  private client: SupabaseClient;
  private table: string;

  constructor(options: SupabaseVectorStoreOptions) {
    this.client = createClient(options.supabaseUrl, options.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Use the canonical `embeddings` table (existing migrations create `embeddings`)
    this.table = options.tableName ?? 'embeddings';
  }

  // Try to set tenant context via RPC if available (RLS-friendly)
  private async setTenantContext(tenantId: string): Promise<void> {
    if (!tenantId) return;
    try {
      // Silently ignore if RPC is not defined in the DB
      const { error } = await this.client.rpc('set_tenant_context', { p_tenant_id: tenantId });
      if (error) {
        // Not fatal — log and continue. Service role keys can bypass RLS.
        logger.debug('set_tenant_context RPC returned error', { error: error.message });
      }
    } catch (err) {
      logger.debug('set_tenant_context RPC not available or failed', { err: (err as Error).message });
    }
  }

  /**
   * Upsert chunks for a tenant. Each chunk should include `content`, `metadata`, and `metadata.embedding` (number[]).
   */
  async upsertChunks(tenantId: string, chunks: any[]): Promise<void> {
    await this.setTenantContext(tenantId);

    const prefer768 = process.env.USE_EMBEDDING_768 === 'true';

    const rows = chunks.map((chunk) => {
      const id = chunk.id || chunk.metadata?.id || crypto.randomUUID();
      const content = chunk.content ?? chunk.text ?? '';
      const metadata = chunk.metadata ?? {};

      // Prefer explicit embedding_768 if provided, otherwise fall back to metadata.embedding
      const explicit768 = Array.isArray(metadata.embedding_768) ? metadata.embedding_768 : null;
      const embeddingVal = Array.isArray(metadata.embedding) ? metadata.embedding : null;

      const row: any = {
        id,
        tenant_id: tenantId,
        content,
        metadata,
        created_at: new Date().toISOString(),
      };

      // Routing logic to avoid writing wrong-dimension vectors into incompatible columns
      if (explicit768) {
        // Caller already produced a 768-dim vector
        row.embedding_768 = explicit768;
      // ...existing code...
      } else if (embeddingVal) {
        // Heuristic: route by vector length or feature-flag
        if (embeddingVal.length === 768 || prefer768) {
          row.embedding_768 = embeddingVal;
        // ...existing code...
        } else {
          // Unknown dimension: log and prefer not to write into legacy column to avoid errors
          logger.warn('SupabaseVectorStore: ignoring embedding with unknown dims', { id, dims: embeddingVal.length });
        }
      }

      return row;
    });

    try {
      await timeAsync('vector_store.upsert', async () => {
        const { error } = await this.client.from(this.table).upsert(rows, { onConflict: 'id' });
        if (error) {
          logger.error('SupabaseVectorStore upsert error', { error: error.message });
          metrics.incr('vector_store.upsert.error', 1, { table: this.table });
          throw error;
        }
      }, { table: this.table });
      metrics.incr('vector_store.upsert.rows', rows.length, { table: this.table });
      logger.debug('SupabaseVectorStore upsert completed', { count: rows.length, tenantId });
    } catch (err) {
      logger.error('SupabaseVectorStore upsert failed', { error: (err as Error).message });
      throw err;
    }
  }

  /**
   * Query vector store for nearest neighbors. Requires `filter.queryEmbedding`.
   * Falls back to a RPC named `match_documents` that should be implemented in the DB.
   */
  async query(tenantId: string, _query: string, topK: number, filter?: Record<string, any>): Promise<any[]> {
    const queryEmbedding = filter?.queryEmbedding;
    if (!queryEmbedding) throw new Error('queryEmbedding required for vector query');

    await this.setTenantContext(tenantId);

    try {
      // Preferred: call the DB-side RPC that uses pgvector for fast ANN search
      const prefer768 = process.env.USE_EMBEDDING_768 === 'true';
      // Always use 768-dim RPC
      const rpcName = 'match_embeddings_by_tenant_768';

      let rpcResult: any = null;
      try {
        rpcResult = await timeAsync('vector_store.query.rpc', async () => {
          return await this.client.rpc(rpcName, {
            query_embedding: queryEmbedding,
            match_count: topK,
            match_tenant_id: tenantId,
          });
        }, { rpc: rpcName });
        metrics.incr('vector_store.query.rpc_success', 1, { rpc: rpcName });
      } catch (rpcErr) {
        metrics.incr('vector_store.query.rpc_error', 1, { rpc: rpcName });
        logger.warn('RPC call failed - attempting fallback RPC', { rpcName, err: (rpcErr as Error).message });
      }

      // If RPC returned an error or no data, try the legacy RPC as a fallback
      if (!rpcResult || rpcResult.error) {
        try {
          const { data, error } = await this.client.rpc('match_embeddings_by_tenant', {
            query_embedding: queryEmbedding,
            match_count: topK,
            match_tenant_id: tenantId,
          });
          if (error) {
            logger.warn('Legacy match_embeddings_by_tenant RPC returned error', { error: error.message });
            throw error;
          }
          return (data as any[]) ?? [];
        } catch (legacyErr) {
          logger.warn('Both RPCs failed; falling back to client-side scan', { err: (legacyErr as Error).message });
          throw legacyErr;
        }
      }

      return (rpcResult.data as any[]) ?? [];
    } catch (rpcErr) {
      // Fallback: scan tenant rows and compute naive similarity (not recommended for prod)
      logger.debug('Falling back to client-side nearest-neighbor scan', { err: (rpcErr as Error).message });
      const { data, error } = await this.client
        .from(this.table)
        .select('*')
        .eq('tenant_id', tenantId)
        .limit(1000);

      if (error) {
        logger.error('SupabaseVectorStore fallback scan failed', { error: error.message });
        throw error;
      }

      const rows = (data as any[]) ?? [];
      // Compute simple cosine similarity on client side (embedding arrays)
      const sim = (a: number[], b: number[]) => {
        const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
        const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0) || 1e-12);
        const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0) || 1e-12);
        return dot / (normA * normB);
      };

      const scored = rows
        .map((r) => {
          // Prefer embedding_768
          const vec = Array.isArray(r.embedding_768)
            ? r.embedding_768
            : null;
          const score = vec ? sim(queryEmbedding, vec) : -1;
          return { row: r, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((s) => ({ ...s.row, similarity: s.score }));

      return scored;
    }
  }
}

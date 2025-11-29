// LlamaIndex Supabase Vector Store adapter (scaffold)
// Provides a VectorStore-compatible wrapper using Supabase pgvector
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { VectorStore } from './retrieval-pipeline';
import crypto from 'crypto';
import { LlamaIndexEmbeddingService } from './llamaindex-embeddings';
import { TenantIsolationGuard, TenantIsolationViolationError } from './tenant-isolation';
import { validateTenantId } from './supabase-retriever';
import { logger } from '../observability/logger';

export interface LlamaIndexSupabaseStoreOptions {
  supabaseUrl: string;
  supabaseKey: string;
  tableName?: string;
}

export class LlamaIndexSupabaseStore implements VectorStore {
  private client: SupabaseClient;
  private table: string;

  constructor(options: LlamaIndexSupabaseStoreOptions) {
    this.client = createClient(options.supabaseUrl, options.supabaseKey);
    this.table = options.tableName ?? 'documents';
  }

  /**
   * Upsert chunks into Supabase. Each chunk should include `content`, `metadata`, and `metadata.embedding` (float[]).
   */
  async upsertChunks(tenantId: string, chunks: any[]): Promise<void> {
    const rows = chunks.map((chunk) => ({
      tenant_id: tenantId,
      content: chunk.content,
      metadata: chunk.metadata ?? {},
      embedding: chunk.metadata?.embedding ?? null,
    }));
    try {
      await this.client.from(this.table).upsert(rows, { onConflict: 'tenant_id,content' });
    } catch (err) {
      logger.error('LlamaIndexSupabaseStore upsert failed', { error: (err as Error).message });
      throw err;
    }
  }

  /**
   * Query Supabase using a stored procedure (pgvector) that performs tenant-aware nearest-neighbor search.
   * Expects `filter.queryEmbedding` to contain the query embedding (float[]).
   */
  async query(tenantId: string, query: string, topK: number, filter?: Record<string, any>): Promise<any[]> {
    const queryEmbedding = filter?.queryEmbedding;
    if (!queryEmbedding) throw new Error('queryEmbedding required for vector query');
    try {
      const { data, error } = await this.client.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_count: topK,
        tenant_id: tenantId,
      });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      logger.error('LlamaIndexSupabaseStore query failed', { error: (err as Error).message });
      throw err;
    }
  }

  // Optional: helper to construct a LlamaIndex-compatible in-memory store or adapter
  // to be implemented if LlamaIndex expects a specific interface.
  toLlamaIndexAdapter?(): any {
    // TODO: map to LlamaIndex VectorStore API if required by LlamaIndex core
    return null;
  }
}

export default LlamaIndexSupabaseStore;
/**
 * LlamaIndex Supabase Vector Store (Phase 3)
 * Production-grade, tenant-isolated, audit-logged.
 * 
 * This implements a custom LlamaIndex retriever backed by Supabase with:
 * - Tenant isolation via RLS and explicit tenant_id filtering
 * - Custom SQL function (match_embeddings_by_tenant)
 * - Audit logging for retrieval operations
 * - Feature flag for gradual rollout
 */

export interface LlamaIndexSupabaseRetrieverOptions {
  k?: number;
  similarityThreshold?: number;
}

/**
 * Node structure for LlamaIndex compatibility
 */
export interface NodeWithScore {
  node: {
    getContent(): string;
    metadata?: Record<string, any>;
    getType(): string;
    getHash(): string;
  };
  score: number;
}

/**
 * LlamaIndex-compatible retriever backed by Supabase
 */
export class LlamaIndexSupabaseRetriever {
  private client: SupabaseClient;
  private embedder: LlamaIndexEmbeddingService;
  private guard: TenantIsolationGuard;
  private tenantId: string;
  private k: number;
  private similarityThreshold: number;

  constructor(
    client: SupabaseClient,
    tenantId: string,
    options?: LlamaIndexSupabaseRetrieverOptions
  ) {
    validateTenantId(tenantId);
    this.client = client;
    this.tenantId = tenantId;
    this.embedder = LlamaIndexEmbeddingService.getInstance();
    this.guard = new TenantIsolationGuard(tenantId);
    this.k = options?.k ?? 3;
    this.similarityThreshold = options?.similarityThreshold ?? 0.0;
  }

  /**
   * Retrieve documents matching a query string
   */
  async retrieve(queryStr: string): Promise<NodeWithScore[]> {
    logger.debug('LlamaIndex Supabase retriever: retrieving documents', {
      query: queryStr.substring(0, 100),
      k: this.k,
      threshold: this.similarityThreshold,
    });

    // Embed the query
    const queryEmbedding = await this.embedder.embed(queryStr);

    // Vector DB monitoring
    const { observeVectorDbQuery } = await import('../monitoring/vector-performance');
    const opStart = Date.now();
    let opStatus = 'success';
    let data, error;
    try {
      // Call Supabase custom function with tenant filter
      ({ data, error } = await this.client.rpc('match_embeddings_by_tenant', {
        query_embedding: queryEmbedding,
        match_count: this.k,
        p_tenant_id: this.tenantId,
      }));
      if (error) throw error;
    } catch (err) {
      opStatus = 'error';
      logger.error('Supabase retrieval failed', { error: (err as Error).message });
      observeVectorDbQuery('supabase_query', opStatus, Date.now() - opStart);
      throw new Error(`Supabase retrieval error: ${(err as Error).message}`);
    }
    observeVectorDbQuery('supabase_query', opStatus, Date.now() - opStart);

    if (!Array.isArray(data)) {
      logger.warn('Supabase returned non-array result', { data });
      return [];
    }

    // Convert Supabase results to LlamaIndex NodeWithScore format
    const nodes: NodeWithScore[] = data
      .filter((row) => row.similarity >= this.similarityThreshold)
      .map((row) => ({
        node: {
          getContent: () => row.content || '',
          metadata: {
            id: row.id,
            tenant_id: row.tenant_id,
            url: row.metadata?.url,
            title: row.metadata?.title,
            section: row.metadata?.section,
          },
          getType: () => 'text',
          getHash: () => row.id,
        },
        score: row.similarity,
      }));

    // Audit log
    this.logRetrievalAudit(queryStr, nodes);

    return nodes;
  }

  /**
   * Add documents to the vector store
   */
  async addDocuments(documents: any[]): Promise<string[]> {
    const ids: string[] = [];
    for (const doc of documents) {
      const content = doc.pageContent || doc.content || '';
      const metadata = doc.metadata || {};
      const docId = metadata.id || crypto.randomUUID();

      // Embed document content
      const embedding = await this.embedder.embed(content);

      // Insert into Supabase
      const { error } = await this.client.from('embeddings').insert([
        {
          id: docId,
          content,
          embedding,
          metadata,
          tenant_id: this.tenantId,
        },
      ]);

      if (error) {
        logger.error('Failed to add document', { error: error.message, docId });
        throw new Error(`Failed to add document: ${error.message}`);
      }

      ids.push(docId);
    }

    logger.info('Documents added to LlamaIndex vector store', {
      count: ids.length,
      tenantId: this.tenantId,
    });

    return ids;
  }

  /**
   * Delete documents from the vector store
   */
  async deleteDocuments(docIds: string[]): Promise<void> {
    const { error } = await this.client
      .from('embeddings')
      .delete()
      .in('id', docIds)
      .eq('tenant_id', this.tenantId);

    if (error) {
      logger.error('Failed to delete documents', { error: error.message });
      throw new Error(`Failed to delete documents: ${error.message}`);
    }

    logger.info('Documents deleted from LlamaIndex vector store', {
      count: docIds.length,
      tenantId: this.tenantId,
    });
  }

  /**
   * Audit log for retrieval operations
   */
  private logRetrievalAudit(query: string, nodes: NodeWithScore[]): void {
    const hashedTenantId = crypto.createHash('sha256').update(this.tenantId).digest('hex');
    const timestamp = new Date().toISOString();
    const topKIds = nodes.slice(0, this.k).map((n) => n.node.metadata?.id || '');

    logger.info('[AUDIT] LlamaIndex RAG Retrieval', {
      timestamp,
      hashedTenantId,
      retrieverId: 'llamaindex-supabase-v3',
      query: query.substring(0, 64),
      topKIds,
      resultCount: nodes.length,
    });
  }
}

/**
 * Create a LlamaIndex Supabase retriever with tenant isolation
 */
export async function createLlamaIndexSupabaseRetriever(
  tenantId: string,
  options?: LlamaIndexSupabaseRetrieverOptions
): Promise<LlamaIndexSupabaseRetriever> {
  validateTenantId(tenantId);

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const missing = Object.entries(env)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Set RLS context for tenant isolation
  const { error } = await client.rpc('set_tenant_context', {
    p_tenant_id: tenantId,
  });

  if (error) {
    throw new Error(`Failed to set tenant context: ${error.message}`);
  }

  return new LlamaIndexSupabaseRetriever(client, tenantId, options);
}

/**
 * Get or create a retriever (singleton per tenant)
 */
const retrieverCache = new Map<string, LlamaIndexSupabaseRetriever>();

export async function getSupabaseRetrieverV3(
  tenantId: string,
  options?: LlamaIndexSupabaseRetrieverOptions
): Promise<LlamaIndexSupabaseRetriever> {
  const cacheKey = tenantId;
  if (retrieverCache.has(cacheKey)) {
    logger.debug('Using cached retriever', { tenantId });
    return retrieverCache.get(cacheKey)!;
  }

  const retriever = await createLlamaIndexSupabaseRetriever(tenantId, options);
  retrieverCache.set(cacheKey, retriever);

  logger.info('Created new LlamaIndex Supabase retriever (v3)', {
    tenantId,
    k: options?.k ?? 3,
  });

  return retriever;
}

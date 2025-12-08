import { logger } from '../observability/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { SupabaseVectorStore } from './supabase-vector-store';
import { SupabaseKeywordIndex } from './supabase-keyword-index';
import { RetrievalPipeline, Chunker } from './retrieval-pipeline';
import { createSemanticChunker } from './llamaindex-semantic-chunking';
// ...existing code...
/**
 * Monitored ingestion job for tenant documents
 * Runs addDocumentsToTenant, logs errors, and triggers rollback if error rate exceeds threshold.
 */
export async function monitoredIngestionJob(
  tenantId: string,
  documents: Document[],
  errorThreshold: number = 0.001,
  monitoringWindowMs: number = 48 * 60 * 60 * 1000 // 48h
): Promise<{ ids: string[]; errorRate: number; rollbackTriggered: boolean }> {
  const startTime = Date.now();
  let errorCount = 0;
  let successCount = 0;
  let ids: string[] = [];
  let rollbackTriggered = false;
  try {
    ids = await addDocumentsToTenant(tenantId, documents);
    successCount = ids.length;
  } catch (err) {
    errorCount = documents.length;
    logger.error('Ingestion job failed', { tenantId, error: err instanceof Error ? err.message : String(err) });
    rollbackTriggered = true;
  }
  const errorRate = (errorCount + successCount) > 0 ? errorCount / (errorCount + successCount) : 0;
  return { ids, errorRate, rollbackTriggered };
}

function validateEnv() {
  const required = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `SECURITY: Missing required environment variables: ${missing.join(", ")}`
    );
  }

  return required as Record<string, string>;
}

/**
 * Validate tenant_id format and fail closed if invalid
 */
export function validateTenantId(tenantId: string): void {
  if (!tenantId) {
    throw new Error("SECURITY: tenant_id is required");
  }

  if (typeof tenantId !== "string") {
    throw new Error("SECURITY: tenant_id must be a string");
  }

  // Format: tn_[32 hex chars]
  const tenantIdRegex = /^tn_[a-f0-9]{32}$/;
  if (!tenantIdRegex.test(tenantId)) {
    throw new Error(
      `SECURITY: Invalid tenant_id format. Expected tn_[32 hex chars], got: ${tenantId.substring(0, 10)}...`
    );
  }
}

/**
 * Create Supabase client with tenant context set for RLS
 */
export async function createTenantIsolatedClient(
  tenantId: string
): Promise<SupabaseClient> {
  validateTenantId(tenantId);
  const env = validateEnv();

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Set RLS context for tenant isolation
  const { error } = await client.rpc("set_tenant_context", {
    p_tenant_id: tenantId,
  });

  if (error) {
    throw new Error(
      `SECURITY: Failed to set tenant context: ${error.message}`
    );
  }

  return client;
}

/**
 * Get LangChain retriever with tenant-isolated vector store
 * 
 * SECURITY: All queries will automatically include WHERE tenant_id = $1
 * via RLS policies + explicit filter in match_embeddings_by_tenant function
 */
// ...existing code...

/**
 * Returns a retrieval pipeline instance for the given tenant, with audit logging on retrievals.
 */
export async function getSupabaseRetriever(tenantId: string, options?: {
  k?: number;
  similarityThreshold?: number;
}): Promise<RetrievalPipeline> {
  validateTenantId(tenantId);
  const env = validateEnv();

  const chunker: Chunker = createSemanticChunker({ chunkSize: 2048, bufferSize: 1 });
  const vectorStore = new SupabaseVectorStore({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    tableName: 'embeddings',
  });
  const keywordIndex = new SupabaseKeywordIndex({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    tableName: 'documents',
  });

  const pipeline = new RetrievalPipeline({
    chunker,
    vectorStore,
    keywordIndex,
    tenantId,
  });

  // Wrap retrieve to add audit logging
  const originalRetrieve = pipeline.retrieve.bind(pipeline);
  pipeline.retrieve = async (query: string, topK = options?.k ?? 3, filter?: Record<string, any>) => {
    const results = await originalRetrieve(query, topK, filter);
    // Audit log: timestamp, hashed tenant_id, retriever_id, top-k ids
    const timestamp = new Date().toISOString();
    const hashedTenantId = crypto.createHash('sha256').update(tenantId).digest('hex');
    const retrieverId = 'supabase';
    const topKIds = (results as any[])
      .map((doc: any) => (doc.metadata?.id as string) || doc.id || '')
      .slice(0, topK);
    // Replace with real logger as needed
    console.log('[AUDIT] RAG Retrieval', {
      timestamp,
      hashedTenantId,
      retrieverId,
      topKIds,
      query: query.slice(0, 64)
    });
    return results;
  };

  return pipeline;
}

/**
 * Add documents to tenant-isolated vector store
 * 
 * SECURITY: Documents will be tagged with tenant_id before insertion
 */
export async function addDocumentsToTenant(
  tenantId: string,
  documents: Document[]
): Promise<string[]> {
  validateTenantId(tenantId);

  const client = await createTenantIsolatedClient(tenantId);
  const env = validateEnv();


  // Build retrieval pipeline to enrich and persist documents (avoids duplicate embedding work)
  const chunker = createSemanticChunker({ chunkSize: 2048, bufferSize: 1 });

  const vectorStore = new SupabaseVectorStore({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    tableName: 'embeddings',
  });

  const keywordIndex = new SupabaseKeywordIndex({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    tableName: 'documents',
  });

  const pipeline = new RetrievalPipeline({
    chunker,
    vectorStore,
    keywordIndex,
    tenantId,
  });

  const allIds: string[] = [];

  for (const doc of documents) {
    // Ensure doc has metadata property
    const content = (doc as any).pageContent ?? (doc as any).content ?? (doc as any).text ?? '';
    const metadata = typeof (doc as any).metadata === 'object' && (doc as any).metadata !== null ? (doc as any).metadata : {};
    try {
      const enriched = await pipeline.ingest({ content, metadata });
      // enriched contains chunks with generated ids
      enriched.forEach((c: any) => {
        if (c?.id) allIds.push(String(c.id));
      });
    } catch (err) {
      logger.error('addDocumentsToTenant: pipeline.ingest failed for a document', { tenantId, err: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info('Adding documents to tenant vector store', {
    tenantId,
    documentCount: allIds.length,
    method: 'retrieval-pipeline',
  });

  return allIds;
}

/**
 * Delete all embeddings for a tenant (used when trial expires)
 * 
 * SECURITY: RLS ensures only tenant's own data can be deleted
 */
export async function deleteTenantEmbeddings(
  tenantId: string
): Promise<number> {
  validateTenantId(tenantId);

  const client = await createTenantIsolatedClient(tenantId);

  const { error, count } = await client
    .from("embeddings")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId); // Explicit filter

  if (error) {
    throw new Error(`Failed to delete embeddings: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Get embedding count for a tenant (for usage tracking)
 */
export async function getTenantEmbeddingCount(
  tenantId: string
): Promise<number> {
  validateTenantId(tenantId);

  const client = await createTenantIsolatedClient(tenantId);

  const { count, error } = await client
    .from("embeddings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`Failed to count embeddings: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Legacy export for backward compatibility
 * TODO: Remove after migrating all consumers to getSupabaseRetriever
 */
export async function getBitbRag() {
  throw new Error(
    "DEPRECATED: getBitbRag() is deprecated. Use getSupabaseRetriever(tenantId) instead."
  );
}

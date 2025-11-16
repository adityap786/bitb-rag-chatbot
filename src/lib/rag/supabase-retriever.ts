/**
 * Supabase-backed RAG Retriever with Tenant Isolation
 * 
 * SECURITY REQUIREMENTS:
 * 1. Every query MUST include WHERE tenant_id = $1
 * 2. Fail closed if tenant context is missing
 * 3. Use RLS (Row-Level Security) for defense in depth
 * 4. Never expose cross-tenant data
 * 
 * Date: 2025-11-10
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";

// Environment validation
function validateEnv() {
  const required = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
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
export async function getSupabaseRetriever(tenantId: string, options?: {
  k?: number;
  similarityThreshold?: number;
}) {
  validateTenantId(tenantId);

  const client = await createTenantIsolatedClient(tenantId);
  const env = validateEnv();

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: env.OPENAI_API_KEY,
    modelName: "text-embedding-ada-002",
  });

  // Create vector store with custom query function that includes tenant filter
  const vectorStore = new SupabaseVectorStore(embeddings, {
    client,
    tableName: "embeddings",
    queryName: "match_embeddings_by_tenant",
  });

  // Wrap retriever to add audit logging
  const retriever = vectorStore.asRetriever({
    k: options?.k ?? 3,
    filter: { match_tenant_id: tenantId },
  });

  // Audit wrapper
  const originalGetRelevantDocuments = retriever.getRelevantDocuments.bind(retriever);
  retriever.getRelevantDocuments = async (query: string) => {
    const docs = await originalGetRelevantDocuments(query);
    // Audit log: timestamp, hashed tenant_id, retriever_id, top-k ids
    const timestamp = new Date().toISOString();
    const hashedTenantId = crypto.createHash('sha256').update(tenantId).digest('hex');
    const retrieverId = 'supabase';
    const topKIds = docs.map(doc => doc.metadata?.id || doc.id || '').slice(0, options?.k ?? 3);
    // Replace with real logger as needed
    console.log('[AUDIT] RAG Retrieval', {
      timestamp,
      hashedTenantId,
      retrieverId,
      topKIds,
      query: query.slice(0, 64)
    });
    return docs;
  };

  return retriever;
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

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: env.OPENAI_API_KEY,
    modelName: "text-embedding-ada-002",
  });

  // Tag documents with tenant_id in metadata
  const taggedDocuments = documents.map((doc) => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      tenant_id: tenantId, // MANDATORY
    },
  }));

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client,
    tableName: "embeddings",
  });

  // Insert documents (RLS will enforce tenant_id filter)
  const ids = await vectorStore.addDocuments(taggedDocuments);

  return ids;
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

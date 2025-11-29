import type { RAGPipelineConfig, EmbeddingChunk, SemanticSearchResult } from '../../types/trial';
import { ExternalServiceError, InternalError } from './errors';
import TrialLogger from './logger';
import { validateTenantId, enforceContextLimits, redactPII } from '../security/rag-guardrails';
import { createLazyServiceClient } from '../supabase-client';
import { generateEmbeddings } from './embeddings';

const supabase = createLazyServiceClient();

/**
 * Chunk text into smaller pieces with overlap for context preservation
 * Uses sentence boundaries to avoid splitting in the middle of sentences
 */
export function chunkText(text: string, chunkSize: number = 512, overlap: number = 50): string[] {
  if (!text || text.length === 0) return [];

  // Split by sentence endings (., !, ?)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      // Keep last 'overlap' characters for context
      currentChunk = currentChunk.slice(-overlap) + sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.filter((chunk: string) => chunk.length > 0);
}

/**
 * Generate embeddings using OpenAI API
 * @throws ExternalServiceError if OpenAI API fails
 */
// generateEmbeddings is now in embeddings.ts

/**
 * Insert embeddings into vector database
 */
export async function insertEmbeddings(
  tenantId: string,
  chunks: EmbeddingChunk[],
  embeddings: number[][]
): Promise<void> {
  validateTenantId(tenantId);
  if (chunks.length === 0) return;

  const records = chunks.map((chunk, i) => ({
    kb_id: chunk.kbId,
    tenant_id: tenantId,
    chunk_text: chunk.text,
    embedding: embeddings[i],
    metadata: chunk.metadata,
  }));

  const { error } = await supabase.from('embeddings').insert(records);

  if (error) {
    throw new InternalError('Failed to insert embeddings into database', new Error(error.message));
  }
}

/**
 * Fetch all knowledge base documents for a tenant
 */
export async function fetchKnowledgeBase(tenantId: string) {
  validateTenantId(tenantId);

  const { data, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new InternalError('Failed to fetch knowledge base', new Error(error.message));
  }

  return data || [];
}

/**
 * Update tenant RAG status
 */
export async function updateTenantStatus(
  tenantId: string,
  status: 'pending' | 'processing' | 'ready' | 'failed'
): Promise<void> {
  validateTenantId(tenantId);

  const { error } = await supabase
    .from('trial_tenants')
    .update({ rag_status: status })
    .eq('tenant_id', tenantId);

  if (error) {
    TrialLogger.warn('Failed to update RAG status', {
      tenantId,
      status,
      error: error.message,
    });
  }
}

/**
 * Perform semantic search on tenant's knowledge base
 * Uses vector similarity search with cosine distance metric
 */
export async function semanticSearch(
  tenantId: string,
  query: string,
  topK: number = 5,
  similarityThreshold: number = 0.7
): Promise<SemanticSearchResult[]> {
  // Use hybridSearch for production retrieval
  // vectorWeight is derived from similarityThreshold (default 0.7)
  const vectorWeight = similarityThreshold;
  return hybridSearch(tenantId, query, topK, vectorWeight);
}

/**
 * Hybrid search combining vector similarity with simple text fallback
 * - vectorWeight controls importance of embedding similarity vs text match (0..1)
 * - returns topK results after merging and scoring
 */
export async function hybridSearch(
  tenantId: string,
  query: string,
  topK: number = 5,
  vectorWeight: number = 0.7
): Promise<SemanticSearchResult[]> {
  if (!query || query.trim().length === 0) return [];

  // Basic guards
  validateTenantId(tenantId);
  if (!process.env.OPENAI_API_KEY) {
    throw new InternalError('OPENAI_API_KEY environment variable is not set');
  }

  try {
    // 1) Vector search (get extra candidates)
    const [queryEmbedding] = await generateEmbeddings([query]);

    const { data: vdata, error: verror } = await supabase.rpc('match_embeddings', {
      query_embedding: queryEmbedding,
      tenant_id: tenantId,
      match_count: Math.max(topK * 2, topK),
      match_threshold: 0.0,
    }) as any;

    if (verror) {
      throw new InternalError('Vector search failed', new Error(verror.message));
    }

    const vectorMatches = (vdata || []).map((r: any) => ({
      embedding_id: r.embedding_id,
      kb_id: r.kb_id,
      chunk_text: r.chunk_text,
      similarity: r.similarity ?? 0,
      metadata: r.metadata || {},
    }));

    // 2) Text search fallback (simple ILIKE on raw_text)
    const { data: tdata, error: terror } = await supabase
      .from('knowledge_base')
      .select('kb_id, raw_text, metadata')
      .eq('tenant_id', tenantId)
      .ilike('raw_text', `%${query}%`)
      .range(0, Math.max(topK * 2 - 1, 0));

    if (terror) {
      throw new InternalError('Text search failed', new Error(terror.message));
    }

    const textMatches = (tdata || []).map((r: any) => ({
      kb_id: r.kb_id,
      chunk_text: r.raw_text,
      metadata: r.metadata || {},
    }));

    // 3) Merge candidates and compute scores
    type Candidate = {
      embedding_id?: string;
      kb_id: string;
      chunk_text: string;
      similarity: number;
      textScore: number;
      metadata: any;
    };

    const candidates: Candidate[] = [];

    // Add vector candidates
    for (const vm of vectorMatches) {
      candidates.push({
        embedding_id: vm.embedding_id,
        kb_id: vm.kb_id,
        chunk_text: vm.chunk_text,
        similarity: vm.similarity,
        textScore: 0,
        metadata: vm.metadata,
      });
    }

    // Add or merge text candidates
    const qLower = query.toLowerCase();
    for (let i = 0; i < textMatches.length; i++) {
      const tm = textMatches[i];
      const txt = (tm.chunk_text || '').toLowerCase();
      let occurrences = 0;
      if (qLower.length > 0) occurrences = txt.split(qLower).length - 1;
      let textScore = 0;
      if (occurrences > 0) textScore = Math.min(1, occurrences / 3);
      else if (txt.includes(qLower)) textScore = 0.5;

      // try to merge with existing candidate for same kb_id
      const existing = candidates.find((c) => c.kb_id === tm.kb_id);
      if (existing) {
        existing.textScore = Math.max(existing.textScore || 0, textScore);
        if (!existing.chunk_text) existing.chunk_text = tm.chunk_text;
      } else {
        candidates.push({
          kb_id: tm.kb_id,
          chunk_text: tm.chunk_text,
          similarity: 0,
          textScore,
          metadata: tm.metadata,
        } as Candidate);
      }
    }

    // Score and sort
    const scored = candidates
      .map((c) => ({
        ...c,
        score: (vectorWeight * (c.similarity || 0)) + ((1 - vectorWeight) * (c.textScore || 0)),
      }))
      .sort((a, b) => (b.score as number) - (a.score as number))
      .slice(0, topK);

    // Apply guardrails (truncate & redact)
    const tmpChunks = scored.map((s) => ({
      text: s.chunk_text,
      chunk_id: s.embedding_id || `hybrid-${s.kb_id}`,
      tenant_id: tenantId,
      similarity: s.similarity,
      metadata: s.metadata,
    }));

    const limited = enforceContextLimits(tmpChunks as any[]);

    const finalResults: SemanticSearchResult[] = limited.map((c: any) => {
      const orig = scored.find((s) => (s.embedding_id && s.embedding_id === c.chunk_id) || s.kb_id === c.chunk_id.replace(/^hybrid-/, '')) || ({} as any);
      const { redacted } = redactPII(c.text || '');
      return {
        embedding_id: c.chunk_id,
        kb_id: (orig as any).kb_id || c.chunk_id.replace(/^hybrid-/, ''),
        chunk_text: redacted,
        similarity: c.similarity ?? (orig as any).similarity ?? 0,
        metadata: (orig as any).metadata || {},
      } as SemanticSearchResult;
    });

    return finalResults;
  } catch (error: any) {
    if (error instanceof InternalError || error instanceof ExternalServiceError) throw error;
    throw new InternalError('Hybrid search error', error);
  }
}

/**
 * Build complete RAG pipeline for knowledge base processing
 */
export async function buildRAGPipeline(
  tenantId: string,
  config: RAGPipelineConfig
): Promise<void> {
  try {
    // Validate tenant early to ensure fail-closed behavior
    validateTenantId(tenantId);

    await updateTenantStatus(tenantId, 'processing');

    // Fetch KB documents
    const docs = await fetchKnowledgeBase(tenantId);

    if (docs.length === 0) {
      await updateTenantStatus(tenantId, 'ready');
      return;
    }

    // Chunk documents
    const chunks: EmbeddingChunk[] = [];
    docs.forEach((doc: any) => {
      const docChunks = chunkText(doc.raw_text, config.chunkSize, config.chunkOverlap);
      docChunks.forEach((chunk: string, index: number) => {
        chunks.push({
          kbId: doc.kb_id,
          text: chunk,
          metadata: {
            ...doc.metadata,
            chunk_index: index,
            source_type: doc.source_type,
          },
        });
      });
    });

    // Generate embeddings
    const chunkTexts = chunks.map((c: EmbeddingChunk) => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    // Insert embeddings
    await insertEmbeddings(tenantId, chunks, embeddings);

    await updateTenantStatus(tenantId, 'ready');

    TrialLogger.logModification('rag_pipeline', 'create', tenantId, tenantId, {
      chunkCount: chunks.length,
      docCount: docs.length,
    });
  } catch (error: any) {
    TrialLogger.error('RAG pipeline build failed', error, { tenantId });
    await updateTenantStatus(tenantId, 'failed');
    throw error;
  }
}

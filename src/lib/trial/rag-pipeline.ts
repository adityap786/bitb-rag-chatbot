import type { RAGPipelineConfig, EmbeddingChunk, SemanticSearchResult } from '../../types/trial';
import type { IngestionStepKey } from '@/types/ingestion';
import type { IngestionJob } from '../../types/ingestion';
import { ExternalServiceError, InternalError } from './errors';
import TrialLogger from './logger';
import { validateTenantId, enforceContextLimits, redactPII } from '../security/rag-guardrails';
import { createLazyServiceClient, setTenantContext } from '../supabase-client';
import { generateEmbeddings } from './embeddings';
import { recordStepComplete, recordStepFailure, recordStepStart } from './ingestion-steps';
import { metrics } from '../telemetry';

const supabase = createLazyServiceClient();

/**
 * Chunk text into smaller pieces with overlap for context preservation
 * Uses sentence boundaries to avoid splitting in the middle of sentences
 * Default chunkSize 1024 chars (~256 tokens) is safe for MPNet (512 tokens max)
 */
export function chunkText(text: string, chunkSize: number = 1024, overlap: number = 100): string[] {
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

  // Ensure RLS context is set
  await setTenantContext(supabase, tenantId);

  const records = chunks.map((chunk, i) => ({
    kb_id: chunk.kbId,
    tenant_id: tenantId,
    content: chunk.text, // Required by schema
    chunk_text: chunk.text, // Optional but good for clarity
    embedding_768: embeddings[i], // Schema uses embedding_768
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
  // Removed OpenAI check as we use local MPNet
  // if (!process.env.OPENAI_API_KEY) { ... }

  try {
    // 1) Vector search (get extra candidates)
    const [queryEmbedding] = await generateEmbeddings([query]);

    // Ensure RLS context is set for RPC
    await setTenantContext(supabase, tenantId);

    const { data: vdata, error: verror } = await supabase.rpc('match_embeddings', {
      query_embedding: queryEmbedding,
      match_tenant: tenantId, // Updated parameter name to match migration
      match_count: Math.max(topK * 2, topK),
      similarity_threshold: 0.0, // Updated parameter name
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
  config: RAGPipelineConfig,
  jobId?: string
): Promise<void> {
  // ETA estimates in milliseconds based on typical processing times
  const BASE_ETAS = {
    setup: 500,
    ingestion: 1000,
    chunking: 2000,
    embedding: 5000,
    storing: 2000,
    done: 500,
  };

  // Progressive readiness: enable Playground after MIN vectors
  const MIN_PROGRESSIVE_VECTORS = Number(process.env.MIN_PIPELINE_VECTORS ?? '10');
  let progressiveReadyEmitted = false;

  const startStep = async (stepKey: IngestionStepKey, message?: string, dynamicEtaMs?: number) => {
    if (!jobId) return;
    const etaMs = dynamicEtaMs ?? BASE_ETAS[stepKey] ?? 1000;
    await recordStepStart(jobId, stepKey, { message, etaMs });
  };

  const completeStep = async (stepKey: IngestionStepKey, message?: string) => {
    if (!jobId) return;
    await recordStepComplete(jobId, stepKey, { message });
  };

  const failStep = async (stepKey: IngestionStepKey, message?: string) => {
    if (!jobId) return;
    await recordStepFailure(jobId, stepKey, message);
  };

  try {
    // Validate tenant early to ensure fail-closed behavior
    validateTenantId(tenantId);

    await updateTenantStatus(tenantId, 'processing');
    if (jobId) {
      await supabase.from('ingestion_jobs').update({ status: 'processing', progress: 10 }).eq('job_id', jobId);
    }

    await startStep('setup', 'Preparing your chatbot ingestion workflow');

    await completeStep('setup', 'Tenant validation complete');
    await startStep('ingestion', 'Fetching knowledge base documents');
    // Fetch KB documents
    const docs = await fetchKnowledgeBase(tenantId);
    await completeStep('ingestion', `${docs.length} knowledge base document(s) processed`);

    if (docs.length === 0) {
      await completeStep('ingestion', 'No documents to ingest');
      await startStep('chunking', 'Skipping chunking because no documents exist');
      await completeStep('chunking');
      await startStep('embedding', 'Skipping embeddings because no chunks exist');
      await completeStep('embedding');
      await startStep('storing', 'Finishing job with zero documents');
      await completeStep('storing');
      await startStep('done', 'Pipeline finished with no data');
      await completeStep('done');
      await updateTenantStatus(tenantId, 'ready');
      if (jobId) {
        await supabase.from('ingestion_jobs').update({ status: 'completed', progress: 100 }).eq('job_id', jobId);
      }
      metrics.counter('rag.pipeline.completed', 1, { tenantId });
      return;
    }

    if (jobId) {
      await supabase.from('ingestion_jobs').update({ progress: 20, pages_processed: docs.length }).eq('job_id', jobId);
    }

    // Calculate dynamic ETAs based on document count
    const chunkingEta = Math.max(BASE_ETAS.chunking, docs.length * 200); // ~200ms per doc
    await startStep('chunking', 'Chunking documents', chunkingEta);
    const chunkStart = Date.now();

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

    metrics.timing('rag.chunking.duration', Date.now() - chunkStart, { tenantId });
    metrics.counter('rag.chunks.created', chunks.length, { tenantId });

    await completeStep('chunking', `${chunks.length} chunks created`);
    
    // Calculate embedding ETA: ~50ms per chunk with batching
    const embeddingEta = Math.max(BASE_ETAS.embedding, chunks.length * 50);
    await startStep('embedding', 'Generating embeddings', embeddingEta);

    if (jobId) {
      await supabase.from('ingestion_jobs').update({ progress: 40, chunks_created: chunks.length }).eq('job_id', jobId);
    }

    // Generate embeddings
    const chunkTexts = chunks.map((c: EmbeddingChunk) => c.text);
    const embedStart = Date.now();
    const embeddings = await generateEmbeddings(chunkTexts);
    metrics.timing('rag.embedding.duration', Date.now() - embedStart, { tenantId });

    await completeStep('embedding', `${embeddings.length} embeddings generated`);
    
    // Calculate storing ETA: ~5ms per embedding
    const storingEta = Math.max(BASE_ETAS.storing, embeddings.length * 5);
    await startStep('storing', 'Storing vectors', storingEta);

    if (jobId) {
      await supabase.from('ingestion_jobs').update({ progress: 80, embeddings_count: embeddings.length }).eq('job_id', jobId);
    }

    // Insert embeddings
    const storeStart = Date.now();
    await insertEmbeddings(tenantId, chunks, embeddings);
    metrics.timing('rag.storing.duration', Date.now() - storeStart, { tenantId });
    metrics.counter('rag.vectors.stored', embeddings.length, { tenantId });

    // Progressive readiness: enable Playground early once we have enough vectors
    if (!progressiveReadyEmitted && embeddings.length >= MIN_PROGRESSIVE_VECTORS) {
      await updateTenantStatus(tenantId, 'ready');
      progressiveReadyEmitted = true;
      TrialLogger.info('Progressive readiness enabled', { tenantId, vectorCount: embeddings.length });
    }

    await completeStep('storing', 'Vectors stored');
    await startStep('done', 'Finalizing pipeline');

    // Final status update (may already be 'ready' from progressive)
    if (!progressiveReadyEmitted) {
      await updateTenantStatus(tenantId, 'ready');
    }
    if (jobId) {
      await supabase
        .from('ingestion_jobs')
        .update({ status: 'completed', progress: 100, embeddings_count: embeddings.length })
        .eq('job_id', jobId);
    }

    await completeStep('done', 'Pipeline completed successfully');
    metrics.counter('rag.pipeline.completed', 1, { tenantId });

    TrialLogger.logModification('rag_pipeline', 'create', tenantId, tenantId, {
      chunkCount: chunks.length,
      docCount: docs.length,
    });
  } catch (error: any) {
    TrialLogger.error('RAG pipeline build failed', error, { tenantId });
    await updateTenantStatus(tenantId, 'failed');
    if (jobId) {
      await supabase.from('ingestion_jobs').update({ 
        status: 'failed', 
        error_message: error.message,
        error_details: { stack: error.stack }
      }).eq('job_id', jobId);
      await failStep('done', error.message);
    }
    metrics.counter('rag.pipeline.failed', 1, { tenantId });
    throw error;
  }
}

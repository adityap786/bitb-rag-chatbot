// Example usage: Wiring up Supabase adapters
/*
import { SupabaseVectorStore } from './supabase-vector-store';
import { SupabaseKeywordIndex } from './supabase-keyword-index';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const tenantId = 'tenant_123';

const vectorStore = new SupabaseVectorStore({ supabaseUrl, supabaseKey });
const keywordIndex = new SupabaseKeywordIndex({ supabaseUrl, supabaseKey });

const pipeline = new RetrievalPipeline({
  chunker: new SentenceSplitter(), // or any chunker
  vectorStore,
  keywordIndex,
  tenantId,
});

// Ingest a document (example)
// await pipeline.ingest({ content: 'Hello world', metadata: { embedding: [] } });

// Retrieve with a query embedding (vector) and/or keyword (example)
// const results = await pipeline.retrieve('Hello', 5, { queryEmbedding: [] });
*/
// Unified Retrieval Pipeline integrating chunkers and hybrid search
// This is a scaffold for extensible ingestion and retrieval

import { HybridSearch, HybridSearchOptions } from './hybrid-search';
import crypto from 'crypto';
import { LlamaIndexEmbeddingService } from './llamaindex-embeddings';
import {
  createKeywordExtractor,
  createSummaryExtractor,
  createQuestionsExtractor,
  createEntityExtractor,
} from './metadata-extractors';
import { logger } from '../observability/logger';

// Adapter interfaces for real data integration
export interface VectorStore {
  upsertChunks(tenantId: string, chunks: any[]): Promise<void>;
  query(tenantId: string, query: string, topK: number, filter?: Record<string, any>): Promise<any[]>;
}

export interface KeywordIndex {
  upsertChunks(tenantId: string, chunks: any[]): Promise<void>;
  query(tenantId: string, query: string, topK: number, filter?: Record<string, any>): Promise<any[]>;
}

export interface Chunker {
  parse(document: { content: string; metadata: Record<string, any> }): Promise<any[]>;
}

export interface RetrieverOptions {
  chunker: Chunker;
  vectorStore?: VectorStore;
  keywordIndex?: KeywordIndex;
  hybridSearch?: HybridSearch; // Optional: can be constructed internally
  tenantId?: string;
}

export class RetrievalPipeline {
  private chunker: Chunker;
  private vectorStore: VectorStore;
  private keywordIndex: KeywordIndex;
  private hybridSearch: HybridSearch;
  private tenantId: string;

  constructor(options: RetrieverOptions) {
    this.chunker = options.chunker;
    // Provide safe defaults so unit tests can omit stores/have no-op behavior
    this.vectorStore = options.vectorStore ?? {
      upsertChunks: async () => {},
      query: async () => [],
    };

    this.keywordIndex = options.keywordIndex ?? {
      upsertChunks: async () => {},
      query: async () => [],
    };

    this.tenantId = options.tenantId ?? 'unknown';

    this.hybridSearch =
      options.hybridSearch ??
      new HybridSearch({
        vectorSearch: (query: string, topK: number) => this.vectorStore.query(this.tenantId, query, topK),
        keywordSearch: (query: string, topK: number) => this.keywordIndex.query(this.tenantId, query, topK),
      });
  }

  /**
   * Ingest a document into the retrieval pipeline.
   *
   * Steps:
   * 1. Chunk the document using the configured chunker (supports async chunkers)
   * 2. Compute embeddings for each chunk (batch)
   * 3. Run metadata extractors (keywords, summary, questions, entities)
   * 4. Attach metadata to chunks and persist to vector store + keyword index
   *
   * Returns the enriched chunks that were persisted.
   */
  async ingest(document: { content: string; metadata: Record<string, any> }) {
    // Chunk the document (support chunkers that return Promise)
    const rawChunksAny = await Promise.resolve(this.chunker.parse(document as any));
    const rawChunks: any[] = Array.isArray(rawChunksAny) ? rawChunksAny : [];

    if (!rawChunks || rawChunks.length === 0) return [];

    // Normalize chunk text
    const texts = rawChunks.map((c) => String(c.content ?? c.chunk_text ?? c.text ?? ''));

    // Prepare extractors and embedding service
    const embeddingService = LlamaIndexEmbeddingService.getInstance();
    const keywordExtractor = createKeywordExtractor({ maxKeywords: 10 });
    const summaryExtractor = createSummaryExtractor({ batchSize: 8, cacheEnabled: true, cacheTTL: 3600 });
    const questionsExtractor = createQuestionsExtractor({ questionsPerChunk: 4, batchSize: 8 });
    const entityExtractor = createEntityExtractor();

    // Compute embeddings in batch (best-effort)
    let embeddings: (number[] | null)[] = [];
    try {
      embeddings = await embeddingService.embedBatch(texts);
    } catch (err) {
      logger.error('RetrievalPipeline: embeddingService.embedBatch failed', { err: err instanceof Error ? err.message : String(err) });
      // Fallback - fill with nulls so ingestion can continue (vector store may handle nulls)
      embeddings = texts.map(() => null);
    }

    // Run metadata extractors in parallel where possible
    let keywordsBatch: any[] = [];
    let summariesBatch: string[] = [];
    let questionsBatch: string[][] = [];
    let entitiesBatch: any[] = [];

    try {
      const [kw, sums, qs] = await Promise.all([
        keywordExtractor.extractBatch(texts).catch((e) => {
          logger.warn('keywordExtractor.extractBatch failed', { err: e instanceof Error ? e.message : String(e) });
          return texts.map(() => []);
        }),
        summaryExtractor.summarizeBatch(texts).catch((e) => {
          logger.warn('summaryExtractor.summarizeBatch failed', { err: e instanceof Error ? e.message : String(e) });
          return texts.map(() => '');
        }),
        questionsExtractor.extractBatch(texts).catch((e) => {
          logger.warn('questionsExtractor.extractBatch failed', { err: e instanceof Error ? e.message : String(e) });
          return texts.map(() => []);
        }),
      ]);

      keywordsBatch = kw;
      summariesBatch = sums;
      questionsBatch = qs;
    } catch (err) {
      logger.warn('RetrievalPipeline: one or more batch extractors failed', { err: err instanceof Error ? err.message : String(err) });
      keywordsBatch = texts.map(() => []);
      summariesBatch = texts.map(() => '');
      questionsBatch = texts.map(() => []);
    }

    // Entities: run sequentially per chunk (LLM-backed per-chunk extraction)
    try {
      const entPromises = texts.map((t) =>
        entityExtractor.extract(t).catch((e) => {
          logger.warn('entityExtractor.extract failed for a chunk', { err: e instanceof Error ? e.message : String(e) });
          return [] as any[];
        })
      );
      entitiesBatch = await Promise.all(entPromises);
    } catch (err) {
      logger.warn('RetrievalPipeline: entity extraction failed', { err: err instanceof Error ? err.message : String(err) });
      entitiesBatch = texts.map(() => []);
    }

    // Attach metadata and embeddings to chunks
    const enrichedChunks = rawChunks.map((chunk, i) => {
      const id = chunk.id ?? chunk.metadata?.id ?? crypto.randomUUID();
      const metadata = {
        ...(chunk.metadata || {}),
        tenant_id: this.tenantId,
        embedding: embeddings[i] ?? chunk.metadata?.embedding ?? null,
        keywords: keywordsBatch[i] ?? [],
        summary: summariesBatch[i] ?? '',
        questions: questionsBatch[i] ?? [],
        entities: entitiesBatch[i] ?? [],
      };

      return {
        id,
        content: chunk.content ?? chunk.chunk_text ?? chunk.text ?? '',
        metadata,
      };
    });

    // Persist enriched chunks to stores (async but awaited to ensure persistence)
    try {
      await Promise.all([
        this.vectorStore.upsertChunks(this.tenantId, enrichedChunks).catch((e) => {
          logger.error('RetrievalPipeline: vectorStore.upsertChunks failed', { err: e instanceof Error ? e.message : String(e) });
          throw e;
        }),
        this.keywordIndex.upsertChunks(this.tenantId, enrichedChunks).catch((e) => {
          logger.error('RetrievalPipeline: keywordIndex.upsertChunks failed', { err: e instanceof Error ? e.message : String(e) });
          throw e;
        }),
      ]);
    } catch (err) {
      logger.error('RetrievalPipeline: failed to persist enriched chunks', { err: err instanceof Error ? err.message : String(err) });
    }

    return enrichedChunks;
  }

  async retrieve(query: string, topK = 10, filter?: Record<string, any>) {
    // Use hybrid search for retrieval, with optional filtering
    // Filtering can be passed to vector/keyword stores if supported
    return this.hybridSearch.search(query);
  }
}

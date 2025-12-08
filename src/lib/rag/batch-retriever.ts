
import crypto from 'crypto';
import pLimit from 'p-limit';
import { TenantIsolatedRetriever } from './supabase-retriever-v2';
import { logger } from '../observability/logger';

// Document type for compatibility
interface Document {
  pageContent: string;
  metadata: Record<string, any>;
}

export interface BatchRetrievalRequest {
  query: string;
  k?: number;
  similarityThreshold?: number;
}

export interface BatchRetrievalResult {
  query: string;
  documents: Document[];
  latencyMs: number;
  cached: boolean;
}

interface BatchRetrieverOptions {
  ttlMs?: number;
  concurrency?: number;
}

interface CacheEntry {
  documents: Document[];
  timestamp: number;
}

export class BatchRetriever {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly concurrency: number;

  constructor(
    private readonly retriever: TenantIsolatedRetriever,
    options: BatchRetrieverOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? 60_000;
    this.concurrency = options.concurrency ?? 3;
  }

  async retrieveBatch(requests: BatchRetrievalRequest[]): Promise<BatchRetrievalResult[]> {
    if (requests.length === 0) return [];
    const limit = pLimit(this.concurrency);
    const globalSeen = new Set<string>();

    const tasks = requests.map((request, idx) =>
      limit(async () => ({
        idx,
        entry: await this.retrieveWithCache(request, globalSeen),
      }))
    );

    const responses = await Promise.all(tasks);
    return responses
      .sort((a, b) => a.idx - b.idx)
      .map((item) => item.entry);
  }

  private async retrieveWithCache(
    request: BatchRetrievalRequest,
    globalSeen: Set<string>
  ): Promise<BatchRetrievalResult> {
    const cacheKey = this.buildCacheKey(request);
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && now - cached.timestamp < this.ttlMs) {
      logger.debug('Batch retriever cache hit', {
        query: request.query,
        ttlMs: this.ttlMs,
      });
      return {
        query: request.query,
        documents: cached.documents,
        latencyMs: 0,
        cached: true,
      };
    }

    const retrievalStart = Date.now();
    const documents = await this.retriever.retrieve(request.query);
    const deduped = this.dedupeDocuments(documents, globalSeen);
    this.cache.set(cacheKey, { documents: deduped, timestamp: Date.now() });

    logger.debug('Batch retriever completed', {
      query: request.query,
      results: deduped.length,
      latencyMs: Date.now() - retrievalStart,
    });

    return {
      query: request.query,
      documents: deduped,
      latencyMs: Date.now() - retrievalStart,
      cached: false,
    };
  }

  private dedupeDocuments(documents: Document[], globalSeen: Set<string>): Document[] {
    const seen = new Set<string>();
    return documents.filter((document) => {
      const id = this.extractDocumentId(document);
      if (!id) return false;
      if (globalSeen.has(id) || seen.has(id)) {
        return false;
      }
      seen.add(id);
      globalSeen.add(id);
      return true;
    });
  }

  private extractDocumentId(document: Document): string {
    const metadata = document.metadata ?? {};
    return (
      (metadata.id as string | undefined) ||
      (metadata.embedding_id as string | undefined) ||
      (metadata.kb_id as string | undefined) ||
      crypto.createHash('sha1').update(document.pageContent).digest('hex')
    );
  }

  private buildCacheKey(request: BatchRetrievalRequest): string {
    const digest = crypto
      .createHash('sha1')
      .update(`${request.query}|${request.k ?? 5}|${request.similarityThreshold ?? 0.7}`)
      .digest('hex');
    return `batch:retriever:${digest}`;
  }
}

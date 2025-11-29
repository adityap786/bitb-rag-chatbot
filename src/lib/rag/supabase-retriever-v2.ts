export {};

import crypto from 'crypto';
import Redis from 'ioredis';
import pRetry from 'p-retry';
import { getSupabaseRetriever, validateTenantId } from './supabase-retriever';
import { getTenantConfig } from '../config/tenant-config-loader';

// Document type for compatibility
interface Document {
  pageContent: string;
  metadata: Record<string, any>;
}
import { getSupabaseRetrieverV3 } from './llamaindex-supabase-store';
import { TenantIsolationGuard } from './tenant-isolation';
import { logger } from '../observability/logger';

/**
 * Feature flag to route between LangChain v2 and LlamaIndex v3 retrievers
 * Default: 'v2' (LangChain), set to 'v3' to use LlamaIndex backend
 */
const RAG_RETRIEVER_VERSION = process.env.RAG_RETRIEVER_VERSION || 'v2';

const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MIN_TIMEOUT = 1000;
const DEFAULT_MAX_TIMEOUT = 8000;

export interface SupabasePoolConfig {
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export interface TenantRetrieverOptions {
  k?: number;
  similarityThreshold?: number;
  useCache?: boolean;
  redis?: Redis;
  redisUrl?: string;
  cacheTtlSeconds?: number;
  maxRetries?: number;
  retryMinTimeout?: number;
  retryMaxTimeout?: number;
  supabasePoolConfig?: SupabasePoolConfig;
}

export class TenantIsolatedRetriever {
  private retrieverPromise: Promise<any>;
  private redis: Redis | null;
  private readonly cacheTtl: number;
  private readonly maxRetries: number;
  private readonly retryMinTimeout: number;
  private readonly retryMaxTimeout: number;
  private readonly isolationGuard: TenantIsolationGuard;

  private constructor(
    private readonly tenantId: string,
    private readonly options: Required<Omit<TenantRetrieverOptions, 'redis' | 'redisUrl' | 'supabasePoolConfig'>> & { redis: Redis | null; tenantId: string; supabasePoolConfig?: SupabasePoolConfig }
  ) {
    this.redis = options.redis;
    this.cacheTtl = options.cacheTtlSeconds;
    this.maxRetries = options.maxRetries;
    this.retryMinTimeout = options.retryMinTimeout;
    this.retryMaxTimeout = options.retryMaxTimeout;
    this.retrieverPromise = getSupabaseRetriever(this.tenantId, {
      k: options.k,
      similarityThreshold: options.similarityThreshold,
    });
    this.isolationGuard = new TenantIsolationGuard(this.tenantId);
    
    if (options.supabasePoolConfig) {
      logger.info('TenantIsolatedRetriever initialized with pooling config', {
        tenantId,
        poolConfig: options.supabasePoolConfig,
      });
    }
  }

  static async create(tenantId: string, config?: TenantRetrieverOptions & { userId?: string; sessionId?: string }) {
    validateTenantId(tenantId);

    const redisClient =
      config?.redis ??
      (config?.redisUrl
        ? new Redis(config.redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            connectTimeout: 5000,
          })
        : null);

    // --- YAML-based rollout logic ---
    let useV3 = false;
    try {
      const tenantConfig = getTenantConfig(tenantId);
      const staged = tenantConfig?.rollout?.staged_features || [];
      // Find rollout for retriever v3 (by convention, use 'llamaindex_retriever_v3')
      const v3Feature = staged.find(f => f.name === 'llamaindex_retriever_v3' || f.name === 'use_llamaindex_retriever');
      let rolloutPercent = 0;
      if (v3Feature && typeof v3Feature.rollout === 'string' && v3Feature.rollout.endsWith('%')) {
        rolloutPercent = parseInt(v3Feature.rollout.replace('%', ''), 10);
      } else if (v3Feature && typeof v3Feature.rollout === 'number') {
        rolloutPercent = v3Feature.rollout;
      }
      // Deterministic hash: use userId, sessionId, or tenantId as fallback
      const hashSource = config?.userId || config?.sessionId || tenantId;
      const hash = Math.abs(
        Array.from(hashSource).reduce((acc, c) => acc + c.charCodeAt(0), 0)
      );
      useV3 = rolloutPercent > 0 && (hash % 100) < rolloutPercent;
    } catch (err) {
      // Fallback: do not use v3 if config missing
    }

    // Optionally allow override via env for global testing
    const envOverride = process.env.RAG_RETRIEVER_VERSION;
    if (envOverride === 'v3') useV3 = true;
    if (envOverride === 'v2') useV3 = false;

    const instance = new TenantIsolatedRetriever(tenantId, {
      k: config?.k ?? 5,
      similarityThreshold: config?.similarityThreshold ?? 0.7,
      useCache: config?.useCache ?? true,
      cacheTtlSeconds: config?.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS,
      maxRetries: config?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryMinTimeout: config?.retryMinTimeout ?? DEFAULT_MIN_TIMEOUT,
      retryMaxTimeout: config?.retryMaxTimeout ?? DEFAULT_MAX_TIMEOUT,
      redis: redisClient,
      tenantId,
      supabasePoolConfig: config?.supabasePoolConfig,
    });
    // Attach rollout decision for use in retrieve()
    (instance as any)._useV3Retriever = useV3;
    return instance;
  }

  async retrieve(query: string): Promise<Document[]> {
    // YAML-based rollout: use _useV3Retriever if set, else fallback to env flag
    const useV3 = (this as any)._useV3Retriever ?? (RAG_RETRIEVER_VERSION === 'v3');
    if (useV3) {
      logger.debug('Using LlamaIndex retriever (v3)', { tenantId: this.tenantId });
      return this.retrieveV3(query);
    }
    logger.debug('Using legacy retriever (v2)', { tenantId: this.tenantId });
    return this.retrieveV2(query);
  }

  private async retrieveV2(query: string): Promise<Document[]> {
    // Original LangChain-based retrieval logic
    const retriever = await this.retrieverPromise;
    const cacheKey = this.buildCacheKey(query);
    const tenantId = this.tenantId;

    if (this.options.useCache && this.redis) {
      const cached = await this.getCachedResults(cacheKey);
      if (cached) {
        logger.info('RAG cache hit (v2)', { tenantId });
        return cached;
      }
    }

    const documents = await pRetry(
      async () => retriever.retrieve(query),
      {
        retries: this.maxRetries,
        minTimeout: this.retryMinTimeout,
        maxTimeout: this.retryMaxTimeout,
        factor: 2,
        randomize: true,
        onFailedAttempt(error) {
          logger.warn('Tenant retriever retry (v2)', {
            tenantId,
            queryLength: query.length,
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
              error: error instanceof Error ? error.message : String(error),
          });
        },
      }
    );

    this.isolationGuard.validateRetrievedDocuments(documents, {
      operation: 'tenant_retrieval_v2',
      query,
      documentIds: documents.map((doc: Document) => (doc.metadata?.id as string) || ''),
    });

    if (this.options.useCache && this.redis && documents.length > 0) {
      await this.cacheResults(cacheKey, documents);
    }

    logger.info('RAG retrieval completed (v2)', {
      tenantId: this.tenantId,
      documents: documents.length,
    });

    return documents;
  }

  private async retrieveV3(query: string): Promise<Document[]> {
    // LlamaIndex-based retrieval logic
    const cacheKey = this.buildCacheKey(query);
    const tenantId = this.tenantId;

    if (this.options.useCache && this.redis) {
      const cached = await this.getCachedResults(cacheKey);
      if (cached) {
        logger.info('RAG cache hit (v3)', { tenantId });
        return cached;
      }
    }

    // Vector DB monitoring
    const { observeVectorDbQuery } = await import('../monitoring/vector-performance');
    const opStart = Date.now();
    let opStatus = 'success';
    let nodes;
    try {
      const retriever = await getSupabaseRetrieverV3(this.tenantId, {
        k: this.options.k,
        similarityThreshold: this.options.similarityThreshold,
      });
      nodes = await pRetry(
        async () => retriever.retrieve(query),
        {
          retries: this.maxRetries,
          minTimeout: this.retryMinTimeout,
          maxTimeout: this.retryMaxTimeout,
          factor: 2,
          randomize: true,
          onFailedAttempt(error) {
            logger.warn('Tenant retriever retry (v3)', {
              tenantId,
              queryLength: query.length,
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        }
      );
    } catch (err) {
      opStatus = 'error';
      observeVectorDbQuery('supabase_retrieve_v3', opStatus, Date.now() - opStart);
      throw err;
    }
    observeVectorDbQuery('supabase_retrieve_v3', opStatus, Date.now() - opStart);

    // Convert LlamaIndex nodes to LangChain Document format for compatibility
    const documents = nodes.map(
      (node) => ({
        pageContent: node.node.getContent?.() || '',
        metadata: node.node.metadata || {},
      })
    );

    this.isolationGuard.validateRetrievedDocuments(documents, {
      operation: 'tenant_retrieval_v3',
      query,
      documentIds: documents.map((doc: Document) => (doc.metadata?.id as string) || ''),
    });

    if (this.options.useCache && this.redis && documents.length > 0) {
      await this.cacheResults(cacheKey, documents);
    }

    logger.info('RAG retrieval completed (v3)', {
      tenantId: this.tenantId,
      documents: documents.length,
    });

    return documents;
  }

  private async retrieveOld(query: string): Promise<Document[]> {
    const retriever = await this.retrieverPromise;
    const cacheKey = this.buildCacheKey(query);
    const tenantId = this.tenantId;

    if (this.options.useCache && this.redis) {
      const cached = await this.getCachedResults(cacheKey);
      if (cached) {
        logger.info('RAG cache hit', { tenantId });
        return cached;
      }
    }

    const documents = await pRetry(
      async () => retriever.retrieve(query),
      {
        retries: this.maxRetries,
        minTimeout: this.retryMinTimeout,
        maxTimeout: this.retryMaxTimeout,
        factor: 2,
        randomize: true,
        onFailedAttempt(error) {
          logger.warn('Tenant retriever retry', {
            tenantId,
            queryLength: query.length,
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      }
    );

    this.isolationGuard.validateRetrievedDocuments(documents, {
      operation: 'tenant_retrieval',
      query,
      documentIds: documents.map((doc: Document) => (doc.metadata?.id as string) || ''),
    });

    if (this.options.useCache && this.redis && documents.length > 0) {
      await this.cacheResults(cacheKey, documents);
    }

    logger.info('RAG retrieval completed', {
      tenantId: this.tenantId,
      documents: documents.length,
    });

    return documents;
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  private buildCacheKey(query: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${this.tenantId}:${query}`)
      .digest('hex')
      .slice(0, 16);
    return `rag:cache:${this.tenantId}:${hash}`;
  }

  private async getCachedResults(cacheKey: string): Promise<Document[] | null> {
    if (!this.redis) return null;

    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Array<{ pageContent: string; metadata: Record<string, unknown> }>;
      return parsed.map(
        (entry) => ({
          pageContent: entry.pageContent,
          metadata: entry.metadata,
        })
      );
    } catch (error) {
      logger.warn('Failed to read retriever cache', {
        tenantId: this.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async cacheResults(cacheKey: string, documents: Document[]): Promise<void> {
    if (!this.redis) return;

    try {
      const serialized = JSON.stringify(
        documents.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        }))
      );
      await this.redis.setex(cacheKey, this.cacheTtl, serialized);
    } catch (error) {
      logger.warn('Failed to write retriever cache', {
        tenantId: this.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

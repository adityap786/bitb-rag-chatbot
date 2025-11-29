/**
 * SummaryExtractor - Generate concise summaries for chunks using the project's LLM.
 *
 * Production-grade features:
 * - Uses `createLlm` factory to obtain configured LLM adapter
 * - Batch processing with configurable batch size
 * - In-memory optional cache with TTL and pluggable cache backend
 * - Exponential backoff retry for transient LLM failures
 * - Graceful error handling and logging
 */

import crypto from 'crypto';
import { createLlm, LLMAdapter } from '../llm-factory';
import { logger } from '../../observability/logger';
import { SUMMARY_EXTRACTION_PROMPT, formatPrompt } from '../../prompts';

export interface SummaryExtractorOptions {
  model?: string;
  batchSize?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number; // seconds
  /** Optional cache backend implementing get/set (Redis-like) */
  cacheBackend?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  };
  retries?: number;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export class SummaryExtractor {
  private readonly opts: Required<SummaryExtractorOptions>;
  private readonly memoryCache: Map<string, CacheEntry> = new Map();
  private llmAdapter: LLMAdapter | null = null;
  private initializing?: Promise<void> | null = null;

  constructor(options: SummaryExtractorOptions = {}) {
    this.opts = {
      model: options.model ?? undefined,
      batchSize: options.batchSize ?? 8,
      cacheEnabled: options.cacheEnabled ?? false,
      cacheTTL: options.cacheTTL ?? 60 * 60, // 1 hour
      cacheBackend: options.cacheBackend ?? null as any,
      retries: options.retries ?? 2,
    } as Required<SummaryExtractorOptions>;
  }

  private async ensureLlm(): Promise<LLMAdapter> {
    if (this.llmAdapter) return this.llmAdapter;
    if (this.initializing) {
      await this.initializing;
      if (!this.llmAdapter) throw new Error('Failed to initialize LLM');
      return this.llmAdapter;
    }

    this.initializing = (async () => {
      const adapter = await createLlm({ model: this.opts.model });
      if (!adapter) {
        throw new Error('No LLM adapter available; check configuration (OPENAI_API_KEY/GROQ_API_KEY)');
      }
      this.llmAdapter = adapter;
    })();

    try {
      await this.initializing;
      return this.llmAdapter!;
    } finally {
      this.initializing = null;
    }
  }

  private hashKey(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  private async getCached(key: string): Promise<string | null> {
    // Prefer pluggable cache backend when provided
    if (this.opts.cacheEnabled && this.opts.cacheBackend) {
      try {
        const v = await this.opts.cacheBackend.get(key);
        if (v) return v;
      } catch (err) {
        logger.warn('SummaryExtractor: cache backend get failed', { err: err instanceof Error ? err.message : String(err) });
      }
    }

    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  private async setCached(key: string, value: string): Promise<void> {
    if (this.opts.cacheEnabled && this.opts.cacheBackend) {
      try {
        await this.opts.cacheBackend.set(key, value, this.opts.cacheTTL);
        return;
      } catch (err) {
        logger.warn('SummaryExtractor: cache backend set failed', { err: err instanceof Error ? err.message : String(err) });
      }
    }

    this.memoryCache.set(key, { value, expiresAt: Date.now() + this.opts.cacheTTL * 1000 });
    // Keep memory cache size bounded
    if (this.memoryCache.size > 1000) {
      const iter = this.memoryCache.keys().next();
      const firstKey = iter.value;
      if (typeof firstKey === 'string') {
        this.memoryCache.delete(firstKey);
      }
    }
  }

  private async requestWithRetry(prompt: string): Promise<string> {
    const adapter = await this.ensureLlm();
    let attempt = 0;
    let lastErr: any = null;
    const max = Math.max(0, this.opts.retries);

    while (attempt <= max) {
      try {
        const resp = await adapter.invoke(prompt);
        return String(resp).trim();
      } catch (err) {
        lastErr = err;
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 10_000);
        logger.warn('SummaryExtractor LLM invocation failed, retrying', { attempt, waitMs, err: err instanceof Error ? err.message : String(err) });
        await new Promise(r => setTimeout(r, waitMs));
        attempt++;
      }
    }

    throw new Error(`SummaryExtractor: LLM failed after ${max + 1} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  private buildPrompt(text: string): string {
    return formatPrompt(SUMMARY_EXTRACTION_PROMPT, { text });
  }

  async summarize(text: string): Promise<string> {
    if (!text || !text.trim()) return '';

    const key = this.hashKey(text + ':summary');
    const cached = await this.getCached(key);
    if (cached) return cached;

    const prompt = this.buildPrompt(text);
    const summary = await this.requestWithRetry(prompt);
    await this.setCached(key, summary);
    return summary;
  }

  async summarizeBatch(texts: string[]): Promise<string[]> {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const results: string[] = [];
    const batchSize = Math.max(1, this.opts.batchSize);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const promises = batch.map(async (t) => {
        const key = this.hashKey(t + ':summary');
        const cached = await this.getCached(key);
        if (cached) return cached;
        const prompt = this.buildPrompt(t);
        const out = await this.requestWithRetry(prompt);
        await this.setCached(key, out);
        return out;
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  }
}

export function createSummaryExtractor(opts?: SummaryExtractorOptions) {
  return new SummaryExtractor(opts);
}

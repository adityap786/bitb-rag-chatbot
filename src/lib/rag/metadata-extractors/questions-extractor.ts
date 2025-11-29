/**
 * QuestionsAnsweredExtractor - Generate specific, answerable questions a chunk could answer.
 *
 * Features:
 * - Uses the configured LLM via `createLlm`
 * - Generates a configurable number of questions per chunk
 * - Batch support and caching
 * - Robust parsing (JSON preferred, newline fallback)
 */

import crypto from 'crypto';
import { createLlm, LLMAdapter } from '../llm-factory';
import { logger } from '../../observability/logger';
import { QUESTION_GENERATION_PROMPT, formatPrompt } from '../../prompts';

export interface QuestionsExtractorOptions {
  model?: string;
  questionsPerChunk?: number;
  batchSize?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  cacheBackend?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  };
  retries?: number;
}

export class QuestionsAnsweredExtractor {
  private readonly opts: Required<QuestionsExtractorOptions>;
  private llmAdapter: LLMAdapter | null = null;
  private memoryCache: Map<string, { value: string; expiresAt: number }> = new Map();
  private initializing?: Promise<void> | null = null;

  constructor(options: QuestionsExtractorOptions = {}) {
    this.opts = {
      model: options.model ?? undefined,
      questionsPerChunk: options.questionsPerChunk ?? 4,
      batchSize: options.batchSize ?? 8,
      cacheEnabled: options.cacheEnabled ?? false,
      cacheTTL: options.cacheTTL ?? 3600,
      cacheBackend: options.cacheBackend ?? null as any,
      retries: options.retries ?? 2,
    } as Required<QuestionsExtractorOptions>;
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
      if (!adapter) throw new Error('LLM adapter not available');
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
    if (this.opts.cacheEnabled && this.opts.cacheBackend) {
      try { return await this.opts.cacheBackend.get(key); } catch (err) { logger.warn('QuestionsExtractor cache get failed', { err: err instanceof Error ? err.message : String(err) }); }
    }
    const e = this.memoryCache.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { this.memoryCache.delete(key); return null; }
    return e.value;
  }

  private async setCached(key: string, value: string): Promise<void> {
    if (this.opts.cacheEnabled && this.opts.cacheBackend) {
      try { await this.opts.cacheBackend.set(key, value, this.opts.cacheTTL); return; } catch (err) { logger.warn('QuestionsExtractor cache set failed', { err: err instanceof Error ? err.message : String(err) }); }
    }
    this.memoryCache.set(key, { value, expiresAt: Date.now() + this.opts.cacheTTL * 1000 });
    if (this.memoryCache.size > 1000) {
      const iter = this.memoryCache.keys().next();
      const first = iter.value;
      if (typeof first === 'string') {
        this.memoryCache.delete(first);
      }
    }
  }

  private async requestWithRetry(prompt: string): Promise<string> {
    const adapter = await this.ensureLlm();
    let attempt = 0; let lastErr: any = null; const max = Math.max(0, this.opts.retries);

    while (attempt <= max) {
      try {
        const resp = await adapter.invoke(prompt);
        return String(resp).trim();
      } catch (err) {
        lastErr = err;
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 10_000);
        logger.warn('QuestionsExtractor LLM invocation failed, retrying', { attempt, waitMs, err: err instanceof Error ? err.message : String(err) });
        await new Promise(r => setTimeout(r, waitMs));
        attempt++;
      }
    }

    throw new Error(`QuestionsExtractor: LLM failed after ${max + 1} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  private buildPrompt(text: string, count: number): string {
    return formatPrompt(QUESTION_GENERATION_PROMPT, { text, count: String(count) });
  }

  private parseResponse(resp: string): string[] {
    // Try JSON parse first
    try {
      const parsed = JSON.parse(resp);
      if (Array.isArray(parsed)) return parsed.map(p => String(p).trim()).filter(Boolean);
    } catch (err) {
      // try to extract JSON substring
      const m = resp.match(/\[.*\]/s);
      if (m) {
        try { const p = JSON.parse(m[0]); if (Array.isArray(p)) return p.map(String); } catch (e) {}
      }
    }

    // Fallback: split by newlines and bullets
    const lines = resp.split(/\r?\n|\n/).map(l => l.replace(/^[-*\d\.\)\s]+/, '').trim()).filter(Boolean);
    // Keep only first N reasonable lines
    return lines;
  }

  async extract(text: string, questionsCount?: number): Promise<string[]> {
    if (!text || !text.trim()) return [];
    const count = questionsCount ?? this.opts.questionsPerChunk;
    const key = this.hashKey(text + `:questions:${count}`);
    const cached = await this.getCached(key);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }

    const prompt = this.buildPrompt(text, count);
    const resp = await this.requestWithRetry(prompt);
    const parsed = this.parseResponse(resp).slice(0, count);
    try { await this.setCached(key, JSON.stringify(parsed)); } catch (e) { /* ignore */ }
    return parsed;
  }

  async extractBatch(texts: string[], questionsCount?: number): Promise<string[][]> {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const results: string[][] = [];
    const batch = Math.max(1, this.opts.batchSize);

    for (let i = 0; i < texts.length; i += batch) {
      const slice = texts.slice(i, i + batch);
      const promises = slice.map(t => this.extract(t, questionsCount));
      const res = await Promise.all(promises);
      results.push(...res);
    }

    return results;
  }
}

export function createQuestionsExtractor(opts?: QuestionsExtractorOptions) {
  return new QuestionsAnsweredExtractor(opts);
}

/**
 * EntityExtractor - Extract entities from text using the configured LLM.
 *
 * Notes:
 * - The extractor requests structured JSON from the LLM and validates/parses it.
 * - If the LLM response cannot be parsed, falls back to simple regex extraction for emails/dates/urls.
 */

import crypto from 'crypto';
import { createLlm, LLMAdapter } from '../llm-factory';
import { logger } from '../../observability/logger';
import { ENTITY_EXTRACTION_PROMPT, formatPrompt } from '../../prompts';

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'product'
  | 'feature'
  | 'money'
  | 'email'
  | 'url'
  | 'other';

export interface ExtractedEntity {
  text: string;
  type: EntityType;
  normalizedText?: string;
  confidence?: number;
  startIndex?: number;
  endIndex?: number;
}

export interface EntityExtractorOptions {
  model?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  cacheBackend?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  };
  retries?: number;
}

export class EntityExtractor {
  private opts: Required<EntityExtractorOptions>;
  private llmAdapter: LLMAdapter | null = null;
  private memoryCache: Map<string, { value: string; expiresAt: number }> = new Map();
  private initializing?: Promise<void> | null = null;

  constructor(options: EntityExtractorOptions = {}) {
    this.opts = {
      model: options.model ?? undefined,
      cacheEnabled: options.cacheEnabled ?? false,
      cacheTTL: options.cacheTTL ?? 3600,
      cacheBackend: options.cacheBackend ?? null as any,
      retries: options.retries ?? 2,
    } as Required<EntityExtractorOptions>;
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
      try { return await this.opts.cacheBackend.get(key); } catch (err) { logger.warn('EntityExtractor cache get failed', { err: err instanceof Error ? err.message : String(err) }); }
    }
    const e = this.memoryCache.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { this.memoryCache.delete(key); return null; }
    return e.value;
  }

  private async setCached(key: string, value: string): Promise<void> {
    if (this.opts.cacheEnabled && this.opts.cacheBackend) {
      try { await this.opts.cacheBackend.set(key, value, this.opts.cacheTTL); return; } catch (err) { logger.warn('EntityExtractor cache set failed', { err: err instanceof Error ? err.message : String(err) }); }
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
        logger.warn('EntityExtractor LLM invocation failed, retrying', { attempt, waitMs, err: err instanceof Error ? err.message : String(err) });
        await new Promise(r => setTimeout(r, waitMs));
        attempt++;
      }
    }

    throw new Error(`EntityExtractor: LLM failed after ${max + 1} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  private buildPrompt(text: string): string {
    return formatPrompt(ENTITY_EXTRACTION_PROMPT, { text });
  }

  private tryParseJsonCandidates(resp: string): any | null {
    // Try direct parse
    try { return JSON.parse(resp); } catch (e) {}
    // Try to extract JSON substring
    const m = resp.match(/\[.*\]/s);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e) {}
    }
    return null;
  }

  private fallbackRegex(text: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];

    // Emails
    const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    let m: RegExpExecArray | null;
    while ((m = emailRe.exec(text))) {
      results.push({ text: m[0], type: 'email', startIndex: m.index, endIndex: m.index + m[0].length, confidence: 0.6, normalizedText: m[0].toLowerCase() });
    }

    // URLs
    const urlRe = /https?:\/\/[\w-./?=&%#~:+,;@]+/g;
    while ((m = urlRe.exec(text))) {
      results.push({ text: m[0], type: 'url', startIndex: m.index, endIndex: m.index + m[0].length, confidence: 0.6, normalizedText: m[0].toLowerCase() });
    }

    // Dates (simple YYYY-MM-DD and common forms)
    const dateRe = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} \w{3,9} \d{4}\b/g;
    while ((m = dateRe.exec(text))) {
      results.push({ text: m[0], type: 'date', startIndex: m.index, endIndex: m.index + m[0].length, confidence: 0.5 });
    }

    return results;
  }

  private normalizeEntityType(t: string): EntityType {
    const nt = String(t || '').toLowerCase();
    switch (nt) {
      case 'person': return 'person';
      case 'organization': case 'org': return 'organization';
      case 'location': case 'loc': return 'location';
      case 'date': return 'date';
      case 'product': return 'product';
      case 'feature': return 'feature';
      case 'money': case 'currency': return 'money';
      case 'email': return 'email';
      case 'url': return 'url';
      default: return 'other';
    }
  }

  private normalizeText(t: string): string {
    return t.trim();
  }

  async extract(text: string): Promise<ExtractedEntity[]> {
    if (!text || !text.trim()) return [];

    const key = this.hashKey(text + ':entities');
    const cached = await this.getCached(key);
    if (cached) {
      try { const parsed = JSON.parse(cached); if (Array.isArray(parsed)) return parsed; } catch (e) { /* ignore */ }
    }

    const prompt = this.buildPrompt(text);
    let resp: string;
    try {
      resp = await this.requestWithRetry(prompt);
    } catch (err) {
      logger.warn('EntityExtractor LLM failed, using regex fallback', { err: err instanceof Error ? err.message : String(err) });
      const fallback = this.fallbackRegex(text);
      try { await this.setCached(key, JSON.stringify(fallback)); } catch (e) {}
      return fallback;
    }

    const parsed = this.tryParseJsonCandidates(resp);
    if (!parsed || !Array.isArray(parsed)) {
      logger.warn('EntityExtractor: LLM returned non-JSON, falling back to regex', { sample: resp.slice(0, 200) });
      const fallback = this.fallbackRegex(text);
      try { await this.setCached(key, JSON.stringify(fallback)); } catch (e) {}
      return fallback;
    }

    const entities: ExtractedEntity[] = [];
    for (const item of parsed) {
      try {
        const textVal = this.normalizeText(String(item.text || item.surface || item.name || ''));
        if (!textVal) continue;
        const typeVal = this.normalizeEntityType(String(item.type || 'other'));
        const confidence = typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : (item.score ?? 0.7);
        const start = typeof item.startIndex === 'number' ? item.startIndex : undefined;
        const end = typeof item.endIndex === 'number' ? item.endIndex : (start ? start + textVal.length : undefined);

        entities.push({ text: textVal, type: typeVal, normalizedText: textVal.toLowerCase().replace(/\s+/g, '_'), confidence, startIndex: start, endIndex: end });
      } catch (e) {
        logger.warn('EntityExtractor: error parsing item from LLM', { err: e instanceof Error ? e.message : String(e), item });
      }
    }

    try { await this.setCached(key, JSON.stringify(entities)); } catch (e) {}
    return entities;
  }
}

export function createEntityExtractor(opts?: EntityExtractorOptions) {
  return new EntityExtractor(opts);
}

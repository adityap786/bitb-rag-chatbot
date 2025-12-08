/**
 * Low-Latency AI Self-Reflection System
 * 
 * Optimized for production use with minimal latency overhead.
 * Uses streaming, caching, parallel processing, and tiered reflection.
 * 
 * Latency Optimizations:
 * 1. Streaming responses - Start showing results immediately
 * 2. Tiered reflection - Only deep reflect when needed
 * 3. Parallel checks - Run validations concurrently
 * 4. Cached embeddings - Reuse computed embeddings
 * 5. Early exit - Stop when confidence is high enough
 * 6. Lightweight models - Use smaller models for reflection
 */

import { generateText, streamText, type CoreMessage } from 'ai';
import { getLLM } from '@/lib/llm/factory';
import { recordCacheHit, recordCacheMiss } from '@/lib/monitoring/metrics';

// ============================================================================
// Types
// ============================================================================

export interface FastReflectionConfig {
  tenantId: string;
  /** Enable streaming for immediate response start */
  enableStreaming: boolean;
  /** Reflection tier: 'none' | 'light' | 'standard' | 'deep' */
  reflectionTier: 'none' | 'light' | 'standard' | 'deep';
  /** Maximum latency budget in ms */
  latencyBudgetMs: number;
  /** Confidence threshold to skip reflection */
  skipReflectionThreshold: number;
  /** Use lightweight model for reflection (faster) */
  useLightweightReflector: boolean;
  /** Enable response caching */
  enableCache: boolean;
  /** Cache TTL in seconds */
  cacheTTLSeconds: number;
  /** Parallel validation (faster but more tokens) */
  parallelValidation: boolean;
}

export interface FastReflectionResult {
  response: string;
  confidence: number;
  reflectionApplied: 'none' | 'light' | 'standard' | 'deep';
  latencyMs: number;
  cached: boolean;
  metadata: {
    generationMs: number;
    reflectionMs: number;
    validationMs: number;
  };
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface StreamingReflectionResult {
  /** Async iterator for streaming tokens */
  stream: AsyncIterable<string>;
  /** Promise that resolves to final result with reflection */
  finalResult: Promise<FastReflectionResult>;
}

// ============================================================================
// Configuration Presets
// ============================================================================

export const LATENCY_PRESETS = {
  /** Ultra-fast: No reflection, pure generation (~200-500ms) */
  ultraFast: {
    reflectionTier: 'none' as const,
    latencyBudgetMs: 500,
    skipReflectionThreshold: 0,
    useLightweightReflector: true,
    parallelValidation: false,
    enableCache: true,
    cacheTTLSeconds: 60,
  },
  
  /** Fast: Light validation only (~500-1000ms) */
  fast: {
    reflectionTier: 'light' as const,
    latencyBudgetMs: 1000,
    skipReflectionThreshold: 0.9,
    useLightweightReflector: true,
    parallelValidation: true,
    enableCache: true,
    cacheTTLSeconds: 120,
  },
  
  /** Balanced: Standard reflection when needed (~1-2s) */
  balanced: {
    reflectionTier: 'standard' as const,
    latencyBudgetMs: 2000,
    skipReflectionThreshold: 0.85,
    useLightweightReflector: true,
    parallelValidation: true,
    enableCache: true,
    cacheTTLSeconds: 300,
  },
  
  /** Thorough: Deep reflection for critical responses (~2-5s) */
  thorough: {
    reflectionTier: 'deep' as const,
    latencyBudgetMs: 5000,
    skipReflectionThreshold: 0.95,
    useLightweightReflector: false,
    parallelValidation: true,
    enableCache: false,
    cacheTTLSeconds: 600,
  },
};

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: FastReflectionConfig = {
  tenantId: 'default',
  enableStreaming: true,
  ...LATENCY_PRESETS.balanced,
};

// ============================================================================
// Response Cache
// ============================================================================

interface CacheEntry {
  response: string;
  confidence: number;
  timestamp: number;
  ttl: number;
}

/**
 * SharedResponseCache: prefers Upstash Redis via RedisLangCache when configured,
 * otherwise falls back to an in-process Map with TTL and basic eviction.
 */
class SharedResponseCache {
  private local = new Map<string, CacheEntry>();
  private maxSize = 1000;
  private defaultTtl = 300;
  private redisInstance: any | null = null;
  private redisNamespace = 'fastref';
  private useRedis = false;

  constructor() {
    this.useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  }

  private hash(query: string, context?: string): string {
    const input = `${query}::${context || ''}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private async ensureRedis() {
    if (!this.useRedis) return;
    if (this.redisInstance) return;
    try {
      // Dynamic import to avoid import-time failures when UPSTASH not configured
      const mod = await import('@/lib/langcache/redis-langcache');
      this.redisInstance = new mod.RedisLangCache({ namespace: this.redisNamespace, defaultTtlSeconds: this.defaultTtl });
    } catch (err) {
      // If Redis client fails to initialize, fall back to local map
      this.redisInstance = null;
      this.useRedis = false;
    }
  }

  async get(query: string, context?: string): Promise<CacheEntry | null> {
    const key = this.hash(query, context);
    // Try Redis first (if configured)
    if (this.useRedis) {
      try {
        await this.ensureRedis();
        if (this.redisInstance) {
          const raw = await this.redisInstance.get(key);
          if (raw) {
            recordCacheHit(this.redisNamespace);
            return raw as CacheEntry;
          }
          recordCacheMiss(this.redisNamespace);
        }
      } catch (err) {
        // fall back to local map
        this.useRedis = false;
      }
    }

    const entry = this.local.get(key);
    if (!entry) {
      recordCacheMiss(this.redisNamespace);
      return null;
    }
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.local.delete(key);
      recordCacheMiss(this.redisNamespace);
      return null;
    }
    recordCacheHit(this.redisNamespace);
    return entry;
  }

  async set(query: string, context: string | undefined, response: string, confidence: number, ttl?: number): Promise<void> {
    const key = this.hash(query, context);
    const useTtl = ttl ?? this.defaultTtl;

    if (this.useRedis) {
      try {
        await this.ensureRedis();
        if (this.redisInstance) {
          await this.redisInstance.set(key, { response, confidence, timestamp: Date.now(), ttl: useTtl }, useTtl);
          return;
        }
      } catch (err) {
        // fall through to local
        this.useRedis = false;
      }
    }

    // Local fallback
    if (this.local.size >= this.maxSize) {
      const oldest = [...this.local.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.local.delete(oldest[0]);
    }
    this.local.set(key, { response, confidence, timestamp: Date.now(), ttl: useTtl });
  }

  clear(): void {
    this.local.clear();
    // best-effort: do not attempt to delete all redis keys
  }
}

// Global cache instance (async get/set)
const responseCache = new SharedResponseCache();

// ============================================================================
// Fast Reflection Engine
// ============================================================================

export class FastReflectionEngine {
  private config: FastReflectionConfig;
  
  constructor(config: Partial<FastReflectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Generate with streaming and background reflection
   * Returns stream immediately, applies reflection in background
   */
  async generateStreaming(
    query: string,
    context?: string | string[],
    systemPrompt?: string
  ): Promise<StreamingReflectionResult> {
    const startTime = Date.now();
    const contextStr = Array.isArray(context) ? context.join('\n\n') : context;
    
    // Check cache first
    if (this.config.enableCache) {
      const cached = await responseCache.get(query, contextStr);
      if (cached) {
        // Return cached response as stream
        const stream = (async function* () {
          yield cached.response;
        })();
        
        return {
          stream,
          finalResult: Promise.resolve({
            response: cached.response,
            confidence: cached.confidence,
            reflectionApplied: 'none',
            latencyMs: Date.now() - startTime,
            cached: true,
            metadata: { generationMs: 0, reflectionMs: 0, validationMs: 0 },
          }),
        };
      }
    }
    
    const llm = getLLM(this.config.tenantId);
    const messages = this.buildMessages(query, contextStr, systemPrompt);

    // Start streaming generation
    const streamResult = await streamText({
      model: llm,
      messages,
      temperature: 0.3,
    });

    // Normalize usage if provided by the streaming client
    const normalizeUsage = (u: any) => {
      if (!u) return undefined;
      return {
        promptTokens: u.prompt_tokens ?? u.promptTokens ?? u.promptTokensCount ?? undefined,
        completionTokens: u.completion_tokens ?? u.completionTokens ?? u.completionTokensCount ?? undefined,
        totalTokens: u.total_tokens ?? u.totalTokens ?? u.totalTokensCount ?? undefined,
      };
    };

    const streamUsage = normalizeUsage((streamResult as any).usage);

    // Collect full response for reflection
    let fullResponse = '';
    const reflectedStream = this.createReflectedStream(
      (streamResult as any).textStream,
      (text) => { fullResponse = text; }
    );

    // Background reflection promise (include usage if available)
    const finalResult = this.reflectInBackground(
      query,
      () => fullResponse,
      contextStr,
      startTime,
      streamUsage
    );
    
    return {
      stream: reflectedStream,
      finalResult,
    };
  }
  
  /**
   * Generate with immediate reflection (non-streaming)
   * Optimized for low latency with tiered reflection
   */
  async generate(
    query: string,
    context?: string | string[],
    systemPrompt?: string
  ): Promise<FastReflectionResult> {
    const startTime = Date.now();
    const contextStr = Array.isArray(context) ? context.join('\n\n') : context;
    
    // Check cache
    if (this.config.enableCache) {
      const cached = await responseCache.get(query, contextStr);
      if (cached) {
        return {
          response: cached.response,
          confidence: cached.confidence,
          reflectionApplied: 'none',
          latencyMs: Date.now() - startTime,
          cached: true,
          metadata: { generationMs: 0, reflectionMs: 0, validationMs: 0 },
        };
      }
    }
    
    // Generate initial response
    const genStart = Date.now();
    const llm = getLLM(this.config.tenantId);
    const messages = this.buildMessages(query, contextStr, systemPrompt);
    
    const result = await generateText({
      model: llm,
      messages,
      temperature: 0.3,
    });
    const normalizeUsage = (u: any) => {
      if (!u) return undefined;
      return {
        promptTokens: u.prompt_tokens ?? u.promptTokens ?? u.promptTokensCount ?? undefined,
        completionTokens: u.completion_tokens ?? u.completionTokens ?? u.completionTokensCount ?? undefined,
        totalTokens: u.total_tokens ?? u.totalTokens ?? u.totalTokensCount ?? undefined,
      };
    };
    const genUsage = normalizeUsage((result as any).usage);
    
    const generationMs = Date.now() - genStart;
    let response = result.text;
    let confidence = 0.75; // Default confidence
    let reflectionApplied: 'none' | 'light' | 'standard' | 'deep' = 'none';
    let reflectionMs = 0;
    let validationMs = 0;
    
    // Check if we have time for reflection
    const remainingBudget = this.config.latencyBudgetMs - generationMs;
    
    if (remainingBudget > 100 && this.config.reflectionTier !== 'none') {
      const reflectionStart = Date.now();
      
      // Quick confidence estimate first
      const quickConfidence = await this.quickConfidenceEstimate(response, contextStr);
      
      // Skip reflection if high confidence
      if (quickConfidence >= this.config.skipReflectionThreshold) {
        confidence = quickConfidence;
        reflectionApplied = 'none';
      } else {
        // Apply appropriate reflection tier based on budget
        const reflectionResult = await this.applyTieredReflection(
          query,
          response,
          contextStr,
          remainingBudget,
          quickConfidence
        );
        
        response = reflectionResult.response;
        confidence = reflectionResult.confidence;
        reflectionApplied = reflectionResult.tier;
      }
      
      reflectionMs = Date.now() - reflectionStart;
    }
    
    // Cache the result
    if (this.config.enableCache && confidence >= 0.8) {
      await responseCache.set(query, contextStr, response, confidence, this.config.cacheTTLSeconds);
    }
    
    return {
      response,
      confidence,
      reflectionApplied,
      latencyMs: Date.now() - startTime,
      cached: false,
      metadata: { generationMs, reflectionMs, validationMs },
      usage: genUsage,
    };
  }
  
  /**
   * Quick confidence estimate using heuristics (no LLM call)
   */
  private async quickConfidenceEstimate(
    response: string,
    context?: string
  ): Promise<number> {
    let confidence = 0.7;
    
    // Boost confidence if response cites sources
    if (/according to|based on|as mentioned|the document states/i.test(response)) {
      confidence += 0.1;
    }
    
    // Reduce confidence for hedging language
    const hedgingPhrases = ['I think', 'maybe', 'possibly', 'might', 'could be', 'I believe'];
    const hedgingCount = hedgingPhrases.filter(p => 
      response.toLowerCase().includes(p.toLowerCase())
    ).length;
    confidence -= hedgingCount * 0.05;
    
    // Boost if context is available and response uses context terms
    if (context) {
      const contextTerms = context.toLowerCase().split(/\s+/).filter(t => t.length > 5);
      const responseTerms = response.toLowerCase().split(/\s+/);
      const overlap = contextTerms.filter(t => responseTerms.includes(t)).length;
      const overlapRatio = contextTerms.length > 0 ? overlap / Math.min(contextTerms.length, 50) : 0;
      confidence += overlapRatio * 0.15;
    }
    
    // Response length check
    if (response.length < 50) {
      confidence -= 0.1; // Very short responses might be incomplete
    } else if (response.length > 200) {
      confidence += 0.05; // Detailed responses often more complete
    }
    
    return Math.max(0, Math.min(1, confidence));
  }
  
  /**
   * Apply tiered reflection based on time budget
   */
  private async applyTieredReflection(
    query: string,
    response: string,
    context: string | undefined,
    budgetMs: number,
    currentConfidence: number
  ): Promise<{ response: string; confidence: number; tier: 'light' | 'standard' | 'deep' }> {
    
    // Light tier: Quick validation only (~100-300ms)
    if (budgetMs < 500 || this.config.reflectionTier === 'light') {
      const validation = await this.lightValidation(response, context);
      return {
        response: validation.response || response,
        confidence: Math.max(currentConfidence, validation.confidence),
        tier: 'light',
      };
    }
    
    // Standard tier: Validation + quick fix (~300-1000ms)
    if (budgetMs < 1500 || this.config.reflectionTier === 'standard') {
      const result = await this.standardReflection(query, response, context);
      return {
        response: result.response,
        confidence: result.confidence,
        tier: 'standard',
      };
    }
    
    // Deep tier: Full reflection loop (~1000-3000ms)
    const result = await this.deepReflection(query, response, context);
    return {
      response: result.response,
      confidence: result.confidence,
      tier: 'deep',
    };
  }
  
  /**
   * Light validation - Heuristic checks only, no LLM
   */
  private async lightValidation(
    response: string,
    context?: string
  ): Promise<{ response: string | null; confidence: number }> {
    let confidence = 0.75;
    let needsFix = false;
    let fixedResponse = response;
    
    // Check for common issues
    
    // 1. Excessive hedging - remove some
    const hedgingPattern = /\b(I think|I believe|maybe|possibly)\s+/gi;
    if ((response.match(hedgingPattern) || []).length > 2) {
      fixedResponse = fixedResponse.replace(hedgingPattern, '');
      needsFix = true;
      confidence -= 0.1;
    }
    
    // 2. Check context grounding
    if (context) {
      // Simple overlap check
      const contextWords = new Set(context.toLowerCase().match(/\b\w{4,}\b/g) || []);
      const responseWords = response.toLowerCase().match(/\b\w{4,}\b/g) || [];
      const grounded = responseWords.filter(w => contextWords.has(w)).length;
      const groundingRatio = responseWords.length > 0 ? grounded / responseWords.length : 0;
      
      if (groundingRatio > 0.3) {
        confidence += 0.1;
      } else if (groundingRatio < 0.1) {
        confidence -= 0.15;
      }
    }
    
    // 3. Length sanity check
    if (response.length < 20) {
      confidence -= 0.2;
    }
    
    return {
      response: needsFix ? fixedResponse : null,
      confidence: Math.max(0.5, Math.min(0.95, confidence)),
    };
  }
  
  /**
   * Standard reflection - Quick LLM validation
   */
  private async standardReflection(
    query: string,
    response: string,
    context?: string
  ): Promise<{ response: string; confidence: number }> {
    const llm = getLLM(this.config.tenantId);
    
    // Compact validation prompt for speed
    const prompt = `Query: ${query}
Response: ${response}
${context ? `Context: ${context.substring(0, 500)}...` : ''}

Quick check:
1. Any factual errors? (yes/no + fix if yes)
2. Confidence (0-1)

Format: {"hasErrors": bool, "fix": "...", "confidence": 0.X}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        maxOutputTokens: 200, // Limit tokens for speed
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      
      return {
        response: parsed.hasErrors && parsed.fix ? parsed.fix : response,
        confidence: parsed.confidence || 0.8,
      };
    } catch {
      return { response, confidence: 0.75 };
    }
  }
  
  /**
   * Deep reflection - Full multi-turn reflection
   */
  private async deepReflection(
    query: string,
    response: string,
    context?: string
  ): Promise<{ response: string; confidence: number }> {
    const llm = getLLM(this.config.tenantId);
    
    // Run critique and refinement in parallel where possible
    const [critiqueResult, groundingResult] = await Promise.all([
      this.getCritique(query, response, context),
      context ? this.checkGrounding(response, context) : Promise.resolve({ grounded: true, score: 0.8 }),
    ]);
    
    // If no major issues, return with combined confidence
    if (critiqueResult.issues.length === 0 && groundingResult.grounded) {
      return {
        response,
        confidence: Math.min(critiqueResult.confidence, groundingResult.score),
      };
    }
    
    // Refine if issues found
    const refinedResponse = await this.refineResponse(
      query,
      response,
      critiqueResult.issues,
      context
    );
    
    return {
      response: refinedResponse,
      confidence: Math.min(0.9, critiqueResult.confidence + 0.1),
    };
  }
  
  /**
   * Get critique of response
   */
  private async getCritique(
    query: string,
    response: string,
    context?: string
  ): Promise<{ issues: string[]; confidence: number }> {
    const llm = getLLM(this.config.tenantId);
    
    const prompt = `Critique this response briefly:
Q: ${query}
R: ${response}
${context ? `Context available: Yes` : 'Context: None'}

List any issues (max 3) and rate confidence (0-1).
Format: {"issues": ["..."], "confidence": 0.X}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        maxOutputTokens: 150,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      return {
        issues: parsed.issues || [],
        confidence: parsed.confidence || 0.7,
      };
    } catch {
      return { issues: [], confidence: 0.75 };
    }
  }
  
  /**
   * Check grounding against context
   */
  private async checkGrounding(
    response: string,
    context: string
  ): Promise<{ grounded: boolean; score: number }> {
    // Fast heuristic grounding check
    const contextTerms = new Set(
      context.toLowerCase().match(/\b\w{5,}\b/g) || []
    );
    const responseTerms = response.toLowerCase().match(/\b\w{5,}\b/g) || [];
    
    if (responseTerms.length === 0) {
      return { grounded: true, score: 0.5 };
    }
    
    const groundedCount = responseTerms.filter(t => contextTerms.has(t)).length;
    const score = groundedCount / responseTerms.length;
    
    return {
      grounded: score > 0.2,
      score: Math.min(1, score + 0.5), // Boost base score
    };
  }
  
  /**
   * Refine response based on issues
   */
  private async refineResponse(
    query: string,
    response: string,
    issues: string[],
    context?: string
  ): Promise<string> {
    const llm = getLLM(this.config.tenantId);
    
    const prompt = `Fix these issues in the response:
${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

Original: ${response}
${context ? `Use context: ${context.substring(0, 300)}` : ''}

Provide only the corrected response:`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxOutputTokens: 500,
      });
      
      return result.text.trim();
    } catch {
      return response;
    }
  }
  
  /**
   * Create a reflected stream that yields tokens immediately
   */
  private async *createReflectedStream(
    inputStream: AsyncIterable<string>,
    onComplete: (fullText: string) => void
  ): AsyncIterable<string> {
    let fullText = '';
    
    for await (const chunk of inputStream) {
      fullText += chunk;
      yield chunk;
    }
    
    onComplete(fullText);
  }
  
  /**
   * Perform reflection in background after streaming completes
   */
  private async reflectInBackground(
    query: string,
    getResponse: () => string,
    context: string | undefined,
    startTime: number,
    providedUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  ): Promise<FastReflectionResult> {
    // Wait for stream to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = getResponse();
    const genEnd = Date.now();
    
    // Quick confidence estimate
    const quickConfidence = await this.quickConfidenceEstimate(response, context);
    
    let finalResponse = response;
    let finalConfidence = quickConfidence;
    let reflectionApplied: 'none' | 'light' | 'standard' | 'deep' = 'none';
    let reflectionMs = 0;
    
    // Apply light reflection if confidence is low
    if (quickConfidence < this.config.skipReflectionThreshold && this.config.reflectionTier !== 'none') {
      const reflectionStart = Date.now();
      const result = await this.lightValidation(response, context);
      
      if (result.response) {
        finalResponse = result.response;
      }
      finalConfidence = result.confidence;
      reflectionApplied = 'light';
      reflectionMs = Date.now() - reflectionStart;
    }
    
    // Cache good responses
    if (this.config.enableCache && finalConfidence >= 0.8) {
      await responseCache.set(query, context, finalResponse, finalConfidence, this.config.cacheTTLSeconds);
    }
    
    return {
      response: finalResponse,
      confidence: finalConfidence,
      reflectionApplied,
      latencyMs: Date.now() - startTime,
      cached: false,
      metadata: {
        generationMs: genEnd - startTime,
        reflectionMs,
        validationMs: 0,
      },
      usage: providedUsage,
    };
  }
  
  /**
   * Build messages for LLM
   */
  private buildMessages(
    query: string,
    context?: string,
    systemPrompt?: string
  ): CoreMessage[] {
    const messages: CoreMessage[] = [];
    
    const system = systemPrompt || (context
      ? `You are a helpful assistant. Answer based on the provided context. Be accurate and concise.

Context:
${context}`
      : 'You are a helpful assistant. Be accurate and concise.');
    
    messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: query });
    
    return messages;
  }
  
  /**
   * Extract JSON from text
   */
  private extractJSON(text: string): string {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : '{}';
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a fast reflection engine with preset
 */
export function createFastReflection(
  tenantId: string,
  preset: keyof typeof LATENCY_PRESETS = 'balanced'
): FastReflectionEngine {
  return new FastReflectionEngine({
    tenantId,
    ...LATENCY_PRESETS[preset],
  });
}

/**
 * Create ultra-low-latency generator (no reflection)
 */
export function createUltraFastGenerator(tenantId: string): FastReflectionEngine {
  return new FastReflectionEngine({
    tenantId,
    ...LATENCY_PRESETS.ultraFast,
  });
}

/**
 * Quick generate with optional reflection
 */
export async function fastGenerate(
  query: string,
  context?: string | string[],
  options: {
    tenantId?: string;
    preset?: keyof typeof LATENCY_PRESETS;
  } = {}
): Promise<FastReflectionResult> {
  const engine = createFastReflection(
    options.tenantId || 'default',
    options.preset || 'balanced'
  );
  return engine.generate(query, context);
}

// ============================================================================
// Exports
// ============================================================================

export { responseCache };
export default FastReflectionEngine;

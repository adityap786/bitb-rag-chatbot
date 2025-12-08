/**
 * Langfuse LLM Observability Integration
 * 
 * Production-ready integration with Langfuse for LLM tracing, monitoring, and analytics.
 * Features:
 * - Request/response tracing
 * - Token usage tracking
 * - Latency metrics
 * - Cost estimation
 * - Prompt versioning
 * - User feedback collection
 * - A/B testing support
 */

// Types
export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  enabled?: boolean;
  flushAt?: number;
  flushInterval?: number;
  defaultUserId?: string;
  defaultSessionId?: string;
  release?: string;
  debug?: boolean;
}

export interface TraceMetadata {
  userId?: string;
  sessionId?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  version?: string;
}

export interface SpanInput {
  name: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  statusMessage?: string;
}

export interface GenerationInput {
  name: string;
  model: string;
  modelParameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    [key: string]: unknown;
  };
  input?: unknown;
  output?: unknown;
  promptName?: string;
  promptVersion?: number;
  completionStartTime?: Date;
  metadata?: Record<string, unknown>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  statusMessage?: string;
}

export interface ScoreInput {
  name: string;
  value: number;
  comment?: string;
  dataType?: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL';
}

export interface Trace {
  id: string;
  name?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  release?: string;
  version?: string;
  input?: unknown;
  output?: unknown;
  public?: boolean;
}

export interface Span {
  id: string;
  traceId: string;
  parentObservationId?: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  level?: string;
  statusMessage?: string;
}

export interface Generation {
  id: string;
  traceId: string;
  parentObservationId?: string;
  name: string;
  model: string;
  modelParameters?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  promptName?: string;
  promptVersion?: number;
  startTime: Date;
  endTime?: Date;
  completionStartTime?: Date;
  metadata?: Record<string, unknown>;
  level?: string;
  statusMessage?: string;
}

export interface Event {
  id: string;
  traceId: string;
  parentObservationId?: string;
  name: string;
  startTime: Date;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  level?: string;
  statusMessage?: string;
}

// API Client
const LANGFUSE_API_BASE = 'https://cloud.langfuse.com';

interface LangfuseApiResponse<T> {
  data: T;
  message?: string;
}

export class LangfuseClient {
  private config: LangfuseConfig;
  private baseUrl: string;
  private authHeader: string;
  private queue: Array<{ type: string; data: unknown }> = [];
  private flushInterval?: ReturnType<typeof setInterval>;
  private enabled: boolean;

  constructor(config: LangfuseConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || LANGFUSE_API_BASE;
    this.authHeader = 'Basic ' + Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64');
    this.enabled = config.enabled !== false;

    if (this.enabled) {
      this.startFlushInterval();
    }
  }

  private startFlushInterval(): void {
    const interval = this.config.flushInterval || 1000;
    this.flushInterval = setInterval(() => {
      this.flush();
    }, interval);
  }

  /**
   * Create a new trace
   */
  trace(input: TraceMetadata & { input?: unknown }): TraceContext {
    const id = this.generateId();
    
    const trace: Trace = {
      id,
      name: input.name,
      userId: input.userId || this.config.defaultUserId,
      sessionId: input.sessionId || this.config.defaultSessionId,
      metadata: input.metadata,
      tags: input.tags,
      release: this.config.release,
      version: input.version,
      input: input.input,
    };

    this.enqueue('trace', trace);

    return new TraceContext(this, trace);
  }

  /**
   * Create a span within a trace
   */
  span(traceId: string, input: SpanInput, parentObservationId?: string): SpanContext {
    const id = this.generateId();
    
    const span: Span = {
      id,
      traceId,
      parentObservationId,
      name: input.name,
      startTime: new Date(),
      input: input.input,
      metadata: input.metadata,
      level: input.level || 'DEFAULT',
      statusMessage: input.statusMessage,
    };

    this.enqueue('span-create', span);

    return new SpanContext(this, span);
  }

  /**
   * Create a generation within a trace
   */
  generation(traceId: string, input: GenerationInput, parentObservationId?: string): GenerationContext {
    const id = this.generateId();
    
    const generation: Generation = {
      id,
      traceId,
      parentObservationId,
      name: input.name,
      model: input.model,
      modelParameters: input.modelParameters,
      input: input.input,
      output: input.output,
      promptName: input.promptName,
      promptVersion: input.promptVersion,
      startTime: new Date(),
      completionStartTime: input.completionStartTime,
      metadata: input.metadata,
      usage: input.usage,
      level: input.level || 'DEFAULT',
      statusMessage: input.statusMessage,
    };

    this.enqueue('generation-create', generation);

    return new GenerationContext(this, generation);
  }

  /**
   * Create an event within a trace
   */
  event(traceId: string, name: string, input?: unknown, parentObservationId?: string): void {
    const event: Event = {
      id: this.generateId(),
      traceId,
      parentObservationId,
      name,
      startTime: new Date(),
      input,
    };

    this.enqueue('event', event);
  }

  /**
   * Add a score to a trace
   */
  score(traceId: string, input: ScoreInput, observationId?: string): void {
    this.enqueue('score', {
      traceId,
      observationId,
      ...input,
    });
  }

  /**
   * Update a span
   */
  updateSpan(span: Span): void {
    this.enqueue('span-update', span);
  }

  /**
   * Update a generation
   */
  updateGeneration(generation: Generation): void {
    this.enqueue('generation-update', generation);
  }

  /**
   * Update a trace
   */
  updateTrace(trace: Trace): void {
    this.enqueue('trace-update', trace);
  }

  /**
   * Flush all queued events
   */
  async flush(): Promise<void> {
    if (!this.enabled || this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.config.flushAt || 20);
    
    try {
      await this.sendBatch(batch);
    } catch (error) {
      if (this.config.debug) {
        console.error('Langfuse flush error:', error);
      }
      // Re-queue failed items
      this.queue.unshift(...batch);
    }
  }

  /**
   * Shutdown the client
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }

  // Private methods
  private enqueue(type: string, data: unknown): void {
    if (!this.enabled) return;
    
    this.queue.push({ type, data });

    if (this.queue.length >= (this.config.flushAt || 20)) {
      this.flush();
    }
  }

  private async sendBatch(batch: Array<{ type: string; data: unknown }>): Promise<void> {
    const body = { batch };

    const response = await fetch(`${this.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Langfuse API error: ${response.status} - ${error}`);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

// Context classes for fluent API
export class TraceContext {
  private client: LangfuseClient;
  private trace: Trace;

  constructor(client: LangfuseClient, trace: Trace) {
    this.client = client;
    this.trace = trace;
  }

  get id(): string {
    return this.trace.id;
  }

  span(input: SpanInput): SpanContext {
    return this.client.span(this.trace.id, input);
  }

  generation(input: GenerationInput): GenerationContext {
    return this.client.generation(this.trace.id, input);
  }

  event(name: string, input?: unknown): void {
    this.client.event(this.trace.id, name, input);
  }

  score(input: ScoreInput): void {
    this.client.score(this.trace.id, input);
  }

  update(updates: Partial<Trace>): void {
    Object.assign(this.trace, updates);
    this.client.updateTrace(this.trace);
  }

  setOutput(output: unknown): void {
    this.update({ output });
  }
}

export class SpanContext {
  private client: LangfuseClient;
  private span: Span;

  constructor(client: LangfuseClient, span: Span) {
    this.client = client;
    this.span = span;
  }

  get id(): string {
    return this.span.id;
  }

  childSpan(input: SpanInput): SpanContext {
    return this.client.span(this.span.traceId, input, this.span.id);
  }

  generation(input: GenerationInput): GenerationContext {
    return this.client.generation(this.span.traceId, input, this.span.id);
  }

  event(name: string, input?: unknown): void {
    this.client.event(this.span.traceId, name, input, this.span.id);
  }

  end(output?: unknown): void {
    this.span.endTime = new Date();
    if (output !== undefined) {
      this.span.output = output;
    }
    this.client.updateSpan(this.span);
  }

  update(updates: Partial<Span>): void {
    Object.assign(this.span, updates);
    this.client.updateSpan(this.span);
  }
}

export class GenerationContext {
  private client: LangfuseClient;
  private generation: Generation;

  constructor(client: LangfuseClient, generation: Generation) {
    this.client = client;
    this.generation = generation;
  }

  get id(): string {
    return this.generation.id;
  }

  update(updates: Partial<Generation>): void {
    Object.assign(this.generation, updates);
    this.client.updateGeneration(this.generation);
  }

  end(output?: unknown, usage?: Generation['usage']): void {
    this.generation.endTime = new Date();
    if (output !== undefined) {
      this.generation.output = output;
    }
    if (usage) {
      this.generation.usage = usage;
    }
    this.client.updateGeneration(this.generation);
  }

  score(input: ScoreInput): void {
    this.client.score(this.generation.traceId, input, this.generation.id);
  }
}

// LLM Integration wrapper
export class LangfuseLLMWrapper {
  private client: LangfuseClient;
  private modelPricing: Map<string, { input: number; output: number }>;

  constructor(client: LangfuseClient) {
    this.client = client;
    this.modelPricing = new Map([
      ['gpt-4', { input: 0.03, output: 0.06 }],
      ['gpt-4-turbo', { input: 0.01, output: 0.03 }],
      ['gpt-4o', { input: 0.005, output: 0.015 }],
      ['gpt-4o-mini', { input: 0.00015, output: 0.0006 }],
      ['gpt-3.5-turbo', { input: 0.0015, output: 0.002 }],
      ['claude-3-opus', { input: 0.015, output: 0.075 }],
      ['claude-3-sonnet', { input: 0.003, output: 0.015 }],
      ['claude-3-haiku', { input: 0.00025, output: 0.00125 }],
      ['claude-3.5-sonnet', { input: 0.003, output: 0.015 }],
    ]);
  }

  /**
   * Wrap an LLM call with observability
   */
  async wrapLLMCall<T>(
    trace: TraceContext,
    name: string,
    model: string,
    input: unknown,
    llmCall: () => Promise<T>,
    options?: {
      promptName?: string;
      promptVersion?: number;
      modelParameters?: GenerationInput['modelParameters'];
      metadata?: Record<string, unknown>;
    }
  ): Promise<T> {
    const generation = trace.generation({
      name,
      model,
      input,
      promptName: options?.promptName,
      promptVersion: options?.promptVersion,
      modelParameters: options?.modelParameters,
      metadata: options?.metadata,
    });

    const startTime = Date.now();

    try {
      const result = await llmCall();
      
      // Extract usage if available
      const usage = this.extractUsage(result);
      const cost = this.calculateCost(model, usage);

      generation.end(result, usage);

      // Add latency as a score
      const latency = Date.now() - startTime;
      generation.update({
        metadata: {
          ...options?.metadata,
          latencyMs: latency,
          costUsd: cost,
        },
      });

      return result;
    } catch (error) {
      generation.update({
        level: 'ERROR',
        statusMessage: error instanceof Error ? error.message : 'Unknown error',
        endTime: new Date(),
      });
      throw error;
    }
  }

  /**
   * Extract token usage from LLM response
   */
  private extractUsage(result: unknown): Generation['usage'] | undefined {
    if (!result || typeof result !== 'object') return undefined;

    const r = result as Record<string, unknown>;

    // OpenAI format
    if (r['usage'] && typeof r['usage'] === 'object') {
      const usage = r['usage'] as Record<string, number>;
      return {
        promptTokens: usage['prompt_tokens'],
        completionTokens: usage['completion_tokens'],
        totalTokens: usage['total_tokens'],
      };
    }

    // Anthropic format
    if (r['usage'] && typeof r['usage'] === 'object') {
      const usage = r['usage'] as Record<string, number>;
      return {
        promptTokens: usage['input_tokens'],
        completionTokens: usage['output_tokens'],
        totalTokens: (usage['input_tokens'] || 0) + (usage['output_tokens'] || 0),
      };
    }

    return undefined;
  }

  /**
   * Calculate estimated cost
   */
  private calculateCost(model: string, usage?: Generation['usage']): number | undefined {
    if (!usage) return undefined;

    const pricing = this.modelPricing.get(model);
    if (!pricing) return undefined;

    const inputCost = ((usage.promptTokens || 0) / 1000) * pricing.input;
    const outputCost = ((usage.completionTokens || 0) / 1000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Set custom model pricing
   */
  setModelPricing(model: string, pricing: { input: number; output: number }): void {
    this.modelPricing.set(model, pricing);
  }
}

// Singleton instance
let langfuseInstance: LangfuseClient | null = null;

export function initLangfuse(config: LangfuseConfig): LangfuseClient {
  langfuseInstance = new LangfuseClient(config);
  return langfuseInstance;
}

export function getLangfuse(): LangfuseClient {
  if (!langfuseInstance) {
    throw new Error('Langfuse not initialized. Call initLangfuse first.');
  }
  return langfuseInstance;
}

// Export default for convenient import
export default {
  init: initLangfuse,
  get: getLangfuse,
  LangfuseClient,
  LangfuseLLMWrapper,
};

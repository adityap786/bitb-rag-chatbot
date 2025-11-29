/**
 * Langfuse Prompt Management
 * 
 * Centralized prompt versioning and management with Langfuse.
 */

import { LangfuseClient } from './index';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { recordCacheHit, recordCacheMiss } from '@/lib/monitoring/metrics';

export interface PromptTemplate {
  name: string;
  version?: number;
  template: string;
  variables: string[];
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: unknown;
  };
  labels?: string[];
}

export interface CompiledPrompt {
  prompt: string;
  config?: PromptTemplate['config'];
  name: string;
  version: number;
}

export class PromptManager {
  private client: LangfuseClient;
  private cache: Map<string, { prompt: PromptTemplate; fetchedAt: Date }> = new Map();
  private cacheTTL: number;
  private redisInstance: any | null = null;
  private redisNamespace = 'prompts';
  private useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

  constructor(client: LangfuseClient, options?: { cacheTTLMs?: number }) {
    this.client = client;
    this.cacheTTL = options?.cacheTTLMs || 60000; // 1 minute default
  }

  /**
   * Get a prompt by name (optionally specific version)
   */
  async getPrompt(name: string, version?: number): Promise<PromptTemplate | null> {
    const cacheKey = `${name}:${version || 'latest'}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.fetchedAt.getTime()) < this.cacheTTL) {
      recordCacheHit(this.redisNamespace);
      return cached.prompt;
    }

    // Try Redis prompt cache first (if configured)
    if (this.useRedis) {
      try {
        if (!this.redisInstance) {
          const mod = await import('@/lib/langcache/redis-langcache');
          this.redisInstance = new mod.RedisLangCache({ namespace: this.redisNamespace, defaultTtlSeconds: Math.ceil(this.cacheTTL / 1000) });
        }
        const r = await this.redisInstance.get(cacheKey);
        if (r) {
          recordCacheHit(this.redisNamespace);
          const prompt = r as PromptTemplate;
          this.cache.set(cacheKey, { prompt, fetchedAt: new Date() });
          return prompt;
        }
        recordCacheMiss(this.redisNamespace);
      } catch (err) {
        this.useRedis = false;
      }
    }

    // Try Supabase prompt templates table (if available)
    try {
      const supabase = createLazyServiceClient();
      const q = supabase
        .from('prompt_templates')
        .select('name, version, template, variables, config, labels')
        .eq('name', name)
        .order('version', { ascending: false })
        .limit(1);

      const { data, error } = await q;
      if (!error && Array.isArray(data) && data.length > 0) {
        const row: any = data[0];
        const prompt: PromptTemplate = {
          name: row.name,
          version: row.version,
          template: row.template,
          variables: row.variables || [],
          config: row.config || {},
          labels: row.labels || [],
        };
        this.cache.set(cacheKey, { prompt, fetchedAt: new Date() });
        try {
          if (this.useRedis && this.redisInstance) await this.redisInstance.set(cacheKey, prompt);
        } catch (_) {}
        return prompt;
      }
    } catch (err) {
      // Supabase table might not exist or querying may fail - fall back to local
    }

    // Fallback to local registry
    const prompt = this.localPrompts.get(name);
    if (prompt) {
      this.cache.set(cacheKey, { prompt, fetchedAt: new Date() });
      try {
        if (this.useRedis && this.redisInstance) await this.redisInstance.set(cacheKey, prompt);
      } catch (_) {}
    }

    return prompt || null;
  }

  /**
   * Compile a prompt with variables
   */
  async compile(
    name: string,
    variables: Record<string, string>,
    version?: number
  ): Promise<CompiledPrompt | null> {
    const template = await this.getPrompt(name, version);
    if (!template) return null;

    let compiled = template.template;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      compiled = compiled.replace(placeholder, value);
    }

    // Check for unfilled variables
    const unfilled = compiled.match(/{{\s*\w+\s*}}/g);
    if (unfilled) {
      console.warn(`Unfilled variables in prompt ${name}:`, unfilled);
    }

    return {
      prompt: compiled,
      config: template.config,
      name: template.name,
      version: template.version || 1,
    };
  }

  /**
   * Register a local prompt template
   */
  registerPrompt(prompt: PromptTemplate): void {
    this.localPrompts.set(prompt.name, prompt);
  }

  /**
   * Clear prompt cache
   */
  clearCache(): void {
    this.cache.clear();
    // best-effort: clear redis-backed prompt cache if available
    if (this.redisInstance && typeof this.redisInstance.clear === 'function') {
      try { this.redisInstance.clear(); } catch (_) {}
    }
  }

  // Local prompt registry
  private localPrompts: Map<string, PromptTemplate> = new Map([
    ['rag-qa', {
      name: 'rag-qa',
      version: 1,
      template: `You are a helpful assistant answering questions based on the provided context.

Context:
{{context}}

Question: {{question}}

Instructions:
- Answer based only on the provided context
- If the context doesn't contain the answer, say so
- Be concise and accurate
- Cite relevant parts of the context when applicable

Answer:`,
      variables: ['context', 'question'],
      config: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 1000,
      },
    }],
    ['chat-system', {
      name: 'chat-system',
      version: 1,
      template: `You are {{assistant_name}}, a helpful AI assistant for {{company_name}}.

Your role is to:
{{role_description}}

Guidelines:
- Be friendly and professional
- Provide accurate information
- Escalate to human support when needed
- Never make up information

Current context:
- Tenant: {{tenant_id}}
- User: {{user_name}}
- Session: {{session_id}}`,
      variables: ['assistant_name', 'company_name', 'role_description', 'tenant_id', 'user_name', 'session_id'],
      config: {
        model: 'gpt-4o',
        temperature: 0.8,
      },
    }],
    ['product-recommendation', {
      name: 'product-recommendation',
      version: 1,
      template: `Based on the user's preferences and browsing history, recommend relevant products.

User Preferences:
{{preferences}}

Recent Activity:
{{activity}}

Available Products:
{{products}}

Provide personalized recommendations with explanations for why each product is a good match.`,
      variables: ['preferences', 'activity', 'products'],
      config: {
        model: 'gpt-4o-mini',
        temperature: 0.6,
        maxTokens: 800,
      },
    }],
    ['appointment-summary', {
      name: 'appointment-summary',
      version: 1,
      template: `Summarize the following appointment details in a friendly, professional message:

Appointment Type: {{appointment_type}}
Date: {{date}}
Time: {{time}}
Provider: {{provider}}
Location: {{location}}
Notes: {{notes}}

Generate a confirmation message that includes:
1. Key appointment details
2. Any preparation instructions
3. Cancellation/rescheduling information`,
      variables: ['appointment_type', 'date', 'time', 'provider', 'location', 'notes'],
      config: {
        model: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 500,
      },
    }],
    ['legal-analysis', {
      name: 'legal-analysis',
      version: 1,
      template: `Analyze the following legal document or question in the context of {{jurisdiction}} law.

Document/Question:
{{content}}

Relevant Precedents:
{{precedents}}

Provide analysis that:
1. Identifies key legal issues
2. References relevant statutes and case law
3. Explains potential implications
4. Suggests next steps

DISCLAIMER: This is not legal advice. Consult with a licensed attorney.`,
      variables: ['jurisdiction', 'content', 'precedents'],
      config: {
        model: 'gpt-4o',
        temperature: 0.3,
        maxTokens: 1500,
      },
    }],
    ['financial-summary', {
      name: 'financial-summary',
      version: 1,
      template: `Provide a financial summary based on the following data:

Portfolio Data:
{{portfolio}}

Market Context:
{{market_context}}

Time Period: {{time_period}}

Generate a summary that includes:
1. Performance overview
2. Key metrics
3. Risk assessment
4. Recommendations (if applicable)

DISCLAIMER: This is not financial advice. Consult with a licensed financial advisor.`,
      variables: ['portfolio', 'market_context', 'time_period'],
      config: {
        model: 'gpt-4o',
        temperature: 0.4,
        maxTokens: 1200,
      },
    }],
  ]);
}

export default PromptManager;

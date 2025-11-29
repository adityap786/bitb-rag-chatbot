import { OpenAI } from '@llamaindex/openai';

/**
 * LlamaIndex LLM Factory (Phase 5)
 * Production-grade LLM adapter supporting Groq and OpenAI providers.
 * Matches the LLMAdapter interface for easy switching from LangChain.
 * Feature flag: USE_LLAMAINDEX_LLM (default: false)
 */

export interface LLMAdapter {
  invoke(input: string): Promise<string>;
}

const DEFAULT_LLM_PROVIDER = process.env.BITB_LLM_PROVIDER || process.env.LLM_PROVIDER || 'groq';
const DEFAULT_LLM_MODEL = process.env.BITB_LLM_MODEL || process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

/**
 * Groq adapter - OpenAI-compatible API
 */
class GroqAdapter implements LLMAdapter {
  model: string;
  apiKey: string;
  baseUrl: string;

  constructor(model: string, apiKey: string, baseUrl: string) {
    this.model = model;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async invoke(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const payload = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 512,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[Groq] status=${res.status} ${res.statusText} - ${text}`);
    }

    const data = await res.json();
    const message = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
    return String(message);
  }
}

/**
 * LlamaIndex OpenAI adapter
 */
class LlamaIndexOpenAIAdapter implements LLMAdapter {
  llm: OpenAI;

  constructor(llm: OpenAI) {
    this.llm = llm;
  }

  async invoke(prompt: string): Promise<string> {
    const response = await this.llm.complete({
      prompt,
    });
    return response.text;
  }
}

/**
 * Create an LLMAdapter based on environment config
 * Supports: groq, openai
 */
export async function createLlamaIndexLlm(options?: {
  provider?: string;
  model?: string;
}): Promise<LLMAdapter | null> {
  const provider = (
    options?.provider ||
    process.env.BITB_LLM_PROVIDER ||
    process.env.LLM_PROVIDER ||
    DEFAULT_LLM_PROVIDER
  ).toLowerCase();
  const model = options?.model || process.env.BITB_LLM_MODEL || DEFAULT_LLM_MODEL;

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    const baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    if (!apiKey) {
      console.warn('[LLM] GROQ selected but GROQ_API_KEY is not set');
      return null;
    }
    return new GroqAdapter(model, apiKey, baseUrl);
  }

  if (provider === 'openai' || provider === 'openrouter') {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[LLM] OpenAI selected but OPENAI_API_KEY is not set');
      return null;
    }

    try {
      const llm = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model,
        temperature: 0.2,
        maxTokens: 512,
      });
      return new LlamaIndexOpenAIAdapter(llm);
    } catch (err) {
      console.warn('[LLM] Failed to initialize OpenAI', err);
      return null;
    }
  }

  console.warn(`[LLM] Unknown provider: ${provider}`);
  return null;
}

/**
 * Feature flag check for LlamaIndex LLM usage
 */
export function useLlamaIndexLLM(): boolean {
  return process.env.USE_LLAMAINDEX_LLM === 'true';
}

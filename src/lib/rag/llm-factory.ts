

// Generic LLM adapter (keeps a minimal shape used in this app)
export interface LLMAdapter {
  invoke(input: string): Promise<string>;
}

const DEFAULT_LLM_PROVIDER = process.env.BITB_LLM_PROVIDER || process.env.LLM_PROVIDER || "groq";
const DEFAULT_LLM_MODEL = process.env.BITB_LLM_MODEL || process.env.LLM_MODEL || "llama-3.3-70b-versatile";

/**
 * Groq adapter - simple OpenAI-compatible chat call using global fetch.
 */
class GroqAdapter implements LLMAdapter {
  model: string;
  apiKey: string;
  baseUrl: string;

  constructor(model: string, apiKey: string, baseUrl: string) {
    this.model = model;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async invoke(prompt: string): Promise<string> {
    // Groq provides an OpenAI-compatible endpoint under /openai/v1
    const url = `${this.baseUrl}/chat/completions`;
    const payload = {
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      // kept short since we use retrieval + short answers
      max_tokens: 512,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[Groq] status=${res.status} ${res.statusText} - ${text}`);
    }

    const data = await res.json();
    // OpenAI-style response
    const message = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
    return String(message);
  }
}



/**
 * Factory that returns an LLMAdapter instance based on environment config.
 * It supports `groq` and `openai` providers (others may be added later).
 */
export async function createLlm(options?: { provider?: string; model?: string }): Promise<LLMAdapter | null> {
  // Determine provider with clear precedence:
  // 1) explicit option, 2) env var BITB_LLM_PROVIDER / LLM_PROVIDER, 3) if OPENAI_API_KEY exists prefer 'openai', 4) fallback DEFAULT_LLM_PROVIDER
  let provider = options?.provider || process.env.BITB_LLM_PROVIDER || process.env.LLM_PROVIDER;
  if (!provider) {
    provider = process.env.OPENAI_API_KEY ? 'openai' : DEFAULT_LLM_PROVIDER;
  }
  provider = provider.toLowerCase();
  const model = options?.model || process.env.BITB_LLM_MODEL || DEFAULT_LLM_MODEL;

  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    const baseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
    if (!apiKey) {
      console.warn("[LLM] GROQ selected but GROQ_API_KEY is not set");
      return null;
    }
    return new GroqAdapter(model, apiKey, baseUrl);
  }

  if (provider === "openai" || provider === "openrouter") {
    // Use LlamaIndex OpenAI adapter instead of LangChain
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[LLM] OpenAI selected but OPENAI_API_KEY is not set");
      return null;
    }
    try {
      const { createLlamaIndexLlm } = await import("./llamaindex-llm-factory");
      return await createLlamaIndexLlm({ provider: "openai", model });
    } catch (err) {
      console.warn("[LLM] Failed to initialize LlamaIndex OpenAI", err);
      return null;
    }
  }

  // Unknown provider
  console.warn(`[LLM] Unknown provider: ${provider}`);
  return null;
}

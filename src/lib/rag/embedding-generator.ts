// Embedding generator using Hugging Face Inference API (free tier)
import fetch from 'node-fetch';

/**
 * Generate embeddings using Hugging Face's free Inference API.
 * Default: nomic-ai/nomic-embed-text-v1.5 (768 dims, best quality)
 * Only 768-dim model supported: nomic-ai/nomic-embed-text-v1.5
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  
  // If no API key, return a deterministic mock embedding for development
  if (!apiKey) {
    console.warn('[Embedding] No HUGGINGFACE_API_KEY set, returning mock 768-dim embedding');
    // Generate a simple hash-based mock embedding for consistency
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array(768).fill(0).map((_, i) => Math.sin(hash + i) * 0.1);
  }

  // Only supported model: nomic-embed-text-v1.5 (768 dims)
  const model = 'nomic-ai/nomic-embed-text-v1.5';
  const baseUrl = 'https://api-inference.huggingface.co';
  
  const res = await fetch(`${baseUrl}/pipeline/feature-extraction/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: text,
      options: { wait_for_model: true }
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    const message = data?.error || data?.message || res.statusText;
    throw new Error(`Hugging Face API error: ${message}`);
  }

  // HF returns array of embeddings, take first one
  const embedding = Array.isArray(data) ? data[0] : data;
  if (!Array.isArray(embedding)) {
    throw new Error(`Hugging Face API response invalid: ${JSON.stringify(data)}`);
  }

  return embedding;
}

/**
 * QueryDecomposer - Breaks complex queries into simpler sub-queries for RAG
 * Production-grade: LLM-based decomposition, merge strategies, type detection
 */

import { createLlm, LLMAdapter } from '../llm-factory';
import { QUERY_DECOMPOSITION_PROMPT, formatPrompt } from '../../prompts';

export interface SubQuery {
  query: string;
  type: 'factual' | 'comparative' | 'temporal' | 'conditional';
  weight: number;
}

export interface DecomposedQuery {
  original: string;
  isComplex: boolean;
  subQueries: SubQuery[];
  mergeStrategy: 'union' | 'intersection' | 'weighted';
}

export class QueryDecomposer {
  private llmAdapter: LLMAdapter | null = null;
  private initializing?: Promise<void> | null = null;

  private async ensureLlm(): Promise<LLMAdapter> {
    if (this.llmAdapter) return this.llmAdapter;
    if (this.initializing) {
      await this.initializing;
      if (!this.llmAdapter) throw new Error('Failed to initialize LLM');
      return this.llmAdapter;
    }
    this.initializing = (async () => {
      const adapter = await createLlm();
      if (!adapter) throw new Error('LLM adapter not available');
      this.llmAdapter = adapter;
    })();
    await this.initializing;
    this.initializing = null;
    return this.llmAdapter!;
  }

  async decompose(query: string): Promise<DecomposedQuery> {
    if (!query || !query.trim()) throw new Error('Empty query');
    const llm = await this.ensureLlm();
    const prompt = formatPrompt(QUERY_DECOMPOSITION_PROMPT, { query });
    const resp = await llm.invoke(prompt);
    try {
      const parsed = JSON.parse(resp);
      return {
        original: query,
        isComplex: !!parsed.isComplex,
        subQueries: Array.isArray(parsed.subQueries) ? parsed.subQueries : [],
        mergeStrategy: parsed.mergeStrategy || 'union',
      };
    } catch {
      // Fallback: treat as single factual query
      return {
        original: query,
        isComplex: false,
        subQueries: [{ query, type: 'factual', weight: 10 }],
        mergeStrategy: 'union',
      };
    }
  }

  async mergeResults(subResults: any[][]): Promise<any[]> {
    // Simple union merge (deduplicate by content)
    const seen = new Set();
    const merged: any[] = [];
    for (const results of subResults) {
      for (const r of results) {
        const key = r.id || r.content;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(r);
        }
      }
    }
    return merged;
  }
}

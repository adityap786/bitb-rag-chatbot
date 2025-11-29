// HybridSearch: Combines vector and keyword search for RAG
// Extensible, production-quality scaffold

export interface HybridSearchOptions {
  vectorSearch: (query: string, topK: number) => Promise<Array<{ content: string; score: number; metadata?: any }>>;
  keywordSearch: (query: string, topK: number) => Promise<Array<{ content: string; score: number; metadata?: any }>>;
  rerank?: (results: Array<{ content: string; score: number; metadata?: any }>, query: string) => Promise<Array<{ content: string; score: number; metadata?: any }>>;
  topK?: number;
  alpha?: number; // weight for vector vs keyword
}

export class HybridSearch {
  private vectorSearch: HybridSearchOptions['vectorSearch'];
  private keywordSearch: HybridSearchOptions['keywordSearch'];
  private rerank?: HybridSearchOptions['rerank'];
  private topK: number;
  private alpha: number;

  constructor(options: HybridSearchOptions) {
    this.vectorSearch = options.vectorSearch;
    this.keywordSearch = options.keywordSearch;
    this.rerank = options.rerank;
    this.topK = options.topK ?? 10;
    this.alpha = options.alpha ?? 0.5;
  }

  async search(query: string): Promise<Array<{ content: string; score: number; metadata?: any }>> {
    // Run both searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, this.topK),
      this.keywordSearch(query, this.topK),
    ]);
    // Merge results by content (simple union, weighted score)
    const resultMap = new Map<string, { content: string; score: number; metadata?: any }>();
    for (const r of vectorResults) {
      resultMap.set(r.content, { ...r, score: r.score * this.alpha });
    }
    for (const r of keywordResults) {
      if (resultMap.has(r.content)) {
        resultMap.get(r.content)!.score += r.score * (1 - this.alpha);
      } else {
        resultMap.set(r.content, { ...r, score: r.score * (1 - this.alpha) });
      }
    }
    let merged = Array.from(resultMap.values()).sort((a, b) => b.score - a.score).slice(0, this.topK);
    // Optional rerank
    if (this.rerank) {
      merged = await this.rerank(merged, query);
    }
    return merged;
  }
}

/**
 * LlamaIndex SemanticSplitterNodeParser (Phase 1.1.2)
 * Production-level semantic chunking using embedding similarity.
 * 
 * Algorithm:
 * 1. Split document into sentences
 * 2. Compute embeddings for each sentence (with buffer window)
 * 3. Calculate cosine similarity between adjacent sentence groups
 * 4. Identify breakpoints where similarity drops below percentile threshold
 * 5. Group sentences between breakpoints into semantic chunks
 * 
 * Features:
 * - Embedding-based semantic boundary detection
 * - Configurable buffer size for context smoothing
 * - Percentile-based adaptive breakpoint detection
 * - Chunk size constraints with intelligent splitting
 * - Rich metadata including semantic scores
 */

import { LlamaIndexEmbeddingService } from './llamaindex-embeddings';
import { logger } from '../observability/logger';

export interface Document {
  content: string;
  metadata: Record<string, any>;
}

export interface SemanticChunk {
  content: string;
  metadata: Record<string, any> & {
    chunk_index: number;
    sentence_count: number;
    semantic_coherence_score: number;
    start_sentence: number;
    end_sentence: number;
  };
}

export interface SemanticChunkingOptions {
  /** Maximum chunk size in characters (default: 2048) */
  chunkSize?: number;
  /** Minimum chunk size in characters (default: 100) */
  minChunkSize?: number;
  /** Number of sentences to buffer for embedding context (default: 1) */
  bufferSize?: number;
  /** Percentile threshold for breakpoint detection (default: 95) */
  breakpointPercentileThreshold?: number;
  /** Custom embedding function (default: LlamaIndexEmbeddingService) */
  embedFn?: (texts: string[]) => Promise<number[][]>;
  /** Enable batch embedding for performance (default: true) */
  batchEmbedding?: boolean;
  /** Maximum sentences to process at once (default: 100) */
  maxBatchSize?: number;
}

interface SentenceWithEmbedding {
  text: string;
  index: number;
  embedding: number[];
}

interface BreakpointInfo {
  index: number;
  similarity: number;
  isBreakpoint: boolean;
}

export class SemanticSplitterNodeParser {
  private readonly chunkSize: number;
  private readonly minChunkSize: number;
  private readonly bufferSize: number;
  private readonly breakpointPercentileThreshold: number;
  private readonly embedFn: (texts: string[]) => Promise<number[][]>;
  private readonly batchEmbedding: boolean;
  private readonly maxBatchSize: number;

  constructor(options: SemanticChunkingOptions = {}) {
    this.chunkSize = options.chunkSize ?? 2048;
    this.minChunkSize = options.minChunkSize ?? 100;
    this.bufferSize = options.bufferSize ?? 1;
    this.breakpointPercentileThreshold = options.breakpointPercentileThreshold ?? 95;
    this.batchEmbedding = options.batchEmbedding ?? true;
    this.maxBatchSize = options.maxBatchSize ?? 100;

    // Default to LlamaIndex embedding service
    this.embedFn = options.embedFn ?? (async (texts: string[]) => {
      const embeddingService = LlamaIndexEmbeddingService.getInstance();
      return embeddingService.embedBatch(texts);
    });
  }

  /**
   * Split document into semantically coherent chunks
   */
  async split(document: Document): Promise<SemanticChunk[]> {
    const startTime = Date.now();
    
    // Step 1: Split into sentences
    const sentences = this.splitIntoSentences(document.content);
    
    if (sentences.length === 0) {
      return [];
    }

    if (sentences.length === 1) {
      return [{
        content: sentences[0],
        metadata: {
          ...document.metadata,
          chunk_index: 0,
          sentence_count: 1,
          semantic_coherence_score: 1.0,
          start_sentence: 0,
          end_sentence: 0,
        },
      }];
    }

    try {
      // Step 2: Compute embeddings for sentence windows
      const sentenceWindows = this.createSentenceWindows(sentences);
      const embeddings = await this.computeEmbeddings(sentenceWindows);

      // Step 3: Calculate similarities and find breakpoints
      const breakpoints = this.findSemanticBreakpoints(embeddings, sentences.length);

      // Step 4: Create chunks based on breakpoints
      const chunks = this.createChunksFromBreakpoints(
        sentences,
        breakpoints,
        document.metadata
      );

      logger.debug('Semantic chunking complete', {
        inputLength: document.content.length,
        sentenceCount: sentences.length,
        chunkCount: chunks.length,
        processingTimeMs: Date.now() - startTime,
      });

      return chunks;
    } catch (error) {
      logger.error('Semantic chunking failed, falling back to size-based chunking', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Fallback to simple size-based chunking
      return this.fallbackChunking(sentences, document.metadata);
    }
  }

  /**
   * Split text into sentences with improved boundary detection
   */
  private splitIntoSentences(text: string): string[] {
    // Enhanced sentence splitting that handles:
    // - Standard punctuation (.!?)
    // - Abbreviations (Dr., Mr., etc.)
    // - Decimal numbers (3.14)
    // - URLs and emails
    // - Quoted text
    
    const abbreviations = new Set([
      'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'etc', 'inc', 'ltd',
      'co', 'corp', 'st', 'ave', 'blvd', 'dept', 'est', 'fig', 'no', 'vol'
    ]);

    // Normalize whitespace
    const normalized = text.replace(/\s+/g, ' ').trim();
    
    // Split on sentence boundaries
    const rawSentences = normalized.split(/(?<=[.!?])\s+(?=[A-Z])/);
    
    // Post-process to handle edge cases
    const sentences: string[] = [];
    let buffer = '';

    for (const sentence of rawSentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      // Check if this looks like an abbreviation continuation
      const lastWord = buffer.split(/\s+/).pop()?.toLowerCase().replace(/\.$/, '') || '';
      
      if (buffer && abbreviations.has(lastWord)) {
        buffer += ' ' + trimmed;
      } else if (buffer) {
        sentences.push(buffer);
        buffer = trimmed;
      } else {
        buffer = trimmed;
      }
    }

    if (buffer) {
      sentences.push(buffer);
    }

    return sentences.filter(s => s.length > 0);
  }

  /**
   * Create windowed sentence groups for embedding context
   */
  private createSentenceWindows(sentences: string[]): string[] {
    const windows: string[] = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const start = Math.max(0, i - this.bufferSize);
      const end = Math.min(sentences.length, i + this.bufferSize + 1);
      const window = sentences.slice(start, end).join(' ');
      windows.push(window);
    }

    return windows;
  }

  /**
   * Compute embeddings for sentence windows with batching
   */
  private async computeEmbeddings(windows: string[]): Promise<number[][]> {
    if (!this.batchEmbedding || windows.length <= this.maxBatchSize) {
      return this.embedFn(windows);
    }

    // Process in batches for large documents
    const embeddings: number[][] = [];
    
    for (let i = 0; i < windows.length; i += this.maxBatchSize) {
      const batch = windows.slice(i, i + this.maxBatchSize);
      const batchEmbeddings = await this.embedFn(batch);
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /**
   * Find semantic breakpoints using cosine similarity
   */
  private findSemanticBreakpoints(
    embeddings: number[][],
    sentenceCount: number
  ): BreakpointInfo[] {
    const similarities: number[] = [];

    // Calculate cosine similarity between adjacent embeddings
    for (let i = 0; i < embeddings.length - 1; i++) {
      const similarity = this.cosineSimilarity(embeddings[i], embeddings[i + 1]);
      similarities.push(similarity);
    }

    if (similarities.length === 0) {
      return [];
    }

    // Calculate percentile threshold for breakpoints
    const sortedSimilarities = [...similarities].sort((a, b) => a - b);
    const percentileIndex = Math.floor(
      sortedSimilarities.length * (100 - this.breakpointPercentileThreshold) / 100
    );
    const threshold = sortedSimilarities[percentileIndex] ?? 0;

    // Identify breakpoints where similarity drops below threshold
    const breakpoints: BreakpointInfo[] = similarities.map((similarity, index) => ({
      index: index + 1, // Breakpoint is after this sentence
      similarity,
      isBreakpoint: similarity < threshold,
    }));

    return breakpoints;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Create chunks from semantic breakpoints with size constraints
   */
  private createChunksFromBreakpoints(
    sentences: string[],
    breakpoints: BreakpointInfo[],
    documentMetadata: Record<string, any>
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let currentStart = 0;
    let currentSentences: string[] = [];
    let currentLength = 0;
    let coherenceScores: number[] = [];

    const finalizeChunk = (endIndex: number) => {
      if (currentSentences.length === 0) return;

      const content = currentSentences.join(' ');
      const avgCoherence = coherenceScores.length > 0
        ? coherenceScores.reduce((a, b) => a + b, 0) / coherenceScores.length
        : 1.0;

      chunks.push({
        content,
        metadata: {
          ...documentMetadata,
          chunk_index: chunks.length,
          sentence_count: currentSentences.length,
          semantic_coherence_score: Math.round(avgCoherence * 1000) / 1000,
          start_sentence: currentStart,
          end_sentence: endIndex - 1,
        },
      });

      currentStart = endIndex;
      currentSentences = [];
      currentLength = 0;
      coherenceScores = [];
    };

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLength = sentence.length;
      const breakpoint = breakpoints.find(bp => bp.index === i);

      // Check if adding this sentence would exceed chunk size
      const wouldExceedSize = currentLength + sentenceLength + 1 > this.chunkSize;
      const isAtBreakpoint = breakpoint?.isBreakpoint ?? false;
      const hasMinContent = currentLength >= this.minChunkSize;

      // Finalize chunk if:
      // 1. At a semantic breakpoint with minimum content, OR
      // 2. Would exceed chunk size with minimum content
      if ((isAtBreakpoint || wouldExceedSize) && hasMinContent) {
        finalizeChunk(i);
      }

      // Add sentence to current chunk
      currentSentences.push(sentence);
      currentLength += sentenceLength + (currentSentences.length > 1 ? 1 : 0);

      // Track coherence score for this transition
      if (breakpoint) {
        coherenceScores.push(breakpoint.similarity);
      }
    }

    // Finalize remaining sentences
    if (currentSentences.length > 0) {
      finalizeChunk(sentences.length);
    }

    return chunks;
  }

  /**
   * Fallback to simple size-based chunking when semantic fails
   */
  private fallbackChunking(
    sentences: string[],
    documentMetadata: Record<string, any>
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let currentSentences: string[] = [];
    let currentLength = 0;
    let startIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      if (currentLength + sentence.length + 1 > this.chunkSize && currentSentences.length > 0) {
        chunks.push({
          content: currentSentences.join(' '),
          metadata: {
            ...documentMetadata,
            chunk_index: chunks.length,
            sentence_count: currentSentences.length,
            semantic_coherence_score: 0.5, // Unknown for fallback
            start_sentence: startIndex,
            end_sentence: i - 1,
          },
        });

        startIndex = i;
        currentSentences = [];
        currentLength = 0;
      }

      currentSentences.push(sentence);
      currentLength += sentence.length + (currentSentences.length > 1 ? 1 : 0);
    }

    if (currentSentences.length > 0) {
      chunks.push({
        content: currentSentences.join(' '),
        metadata: {
          ...documentMetadata,
          chunk_index: chunks.length,
          sentence_count: currentSentences.length,
          semantic_coherence_score: 0.5,
          start_sentence: startIndex,
          end_sentence: sentences.length - 1,
        },
      });
    }

    return chunks;
  }

  /**
   * Alias for compatibility with Chunker interface
   */
  async parse(document: Document): Promise<SemanticChunk[]> {
    return this.split(document);
  }
}

/**
 * Factory function for creating semantic chunker with default embedding service
 */
export function createSemanticChunker(
  options?: Omit<SemanticChunkingOptions, 'embedFn'>
): SemanticSplitterNodeParser {
  return new SemanticSplitterNodeParser(options);
}

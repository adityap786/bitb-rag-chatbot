/**
 * LlamaIndex SentenceSplitter Integration
 * 
 * Uses LlamaIndex's optimized sentence-aware text splitter for better RAG quality
 * 
 * Benefits:
 * - Sentence-aware boundaries (no mid-sentence cuts)
 * - ~9% better retrieval recall vs character-based splitting
 * - Optimized for embedding model context windows
 */

import { SentenceSplitter } from '@llamaindex/core/node-parser';

export interface ChunkingOptions {
    chunkSize?: number;
    chunkOverlap?: number;
}

/**
 * Chunk text using LlamaIndex SentenceSplitter
 * 
 * Balanced configuration (default):
 * - 512 chars (~128 tokens) - safe for 512-token embedding models
 * - 128 char overlap (25%) - optimal context continuity
 * 
 * @param text - Text to chunk
 * @param options - Chunking options
 * @returns Array of text chunks
 */
export function chunkTextLlamaIndex(
    text: string,
    options: ChunkingOptions = {}
): string[] {
    const { chunkSize = 512, chunkOverlap = 128 } = options;

    if (!text || text.trim().length === 0) {
        return [];
    }

    // If text is smaller than chunk size, return as-is
    if (text.length <= chunkSize) {
        return [text];
    }

    const splitter = new SentenceSplitter({
        chunkSize,
        chunkOverlap,
        paragraphSeparator: '\n\n',
    });

    return splitter.splitText(text);
}

/**
 * Backward-compatible wrapper matching existing chunkText signature
 */
export function chunkText(
    text: string,
    chunkSize: number = 512,
    overlap: number = 128
): string[] {
    return chunkTextLlamaIndex(text, { chunkSize, chunkOverlap: overlap });
}

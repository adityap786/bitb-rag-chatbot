// LlamaIndex SentenceSplitter and chunking utilities
// Phase 1.1: Advanced Chunking


export interface Document {
  content: string;
  metadata: Record<string, any>;
}

export interface Chunk {
  content: string;
  metadata: Record<string, any>;
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  language?: string;
}

export class SentenceSplitter {
  chunkSize: number;
  chunkOverlap: number;
  language: string;

  constructor(options: ChunkingOptions = {}) {
    this.chunkSize = options.chunkSize ?? 512;
    this.chunkOverlap = options.chunkOverlap ?? 128;
    this.language = options.language ?? 'en';
  }

  split(document: Document): Chunk[] {
    // Simple sentence splitting (placeholder, replace with LlamaIndex logic)
    const sentences = document.content.split(/(?<=[.!?])\s+/);
    const chunks: Chunk[] = [];
    let buffer: string[] = [];
    let bufferLen = 0;
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (bufferLen + sentence.length > this.chunkSize && buffer.length > 0) {
        chunks.push({
          content: buffer.join(' '),
          metadata: { ...document.metadata, chunk_index: chunks.length },
        });
        // Overlap: keep last N chars
        const overlapText = buffer.join(' ').slice(-this.chunkOverlap);
        buffer = [overlapText];
        bufferLen = overlapText.length;
      }
      buffer.push(sentence);
      bufferLen += sentence.length;
    }
    if (buffer.length > 0) {
      chunks.push({
        content: buffer.join(' '),
        metadata: { ...document.metadata, chunk_index: chunks.length },
      });
    }
    return chunks;
  }

  // Alias for compatibility with Chunker interface
  parse(document: Document): Chunk[] {
    return this.split(document);
  }
}

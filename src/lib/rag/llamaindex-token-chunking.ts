// LlamaIndex TokenSplitter (token-based chunking)
// Splits text into chunks based on token count (e.g., for LLM context windows)

export interface Document {
  content: string;
  metadata: Record<string, any>;
}

export interface TokenChunk {
  content: string;
  metadata: Record<string, any>;
  tokenStart: number;
  tokenEnd: number;
}

export interface TokenChunkingOptions {
  chunkSize?: number;
  overlap?: number;
  tokenizer?: (text: string) => string[];
}

export class TokenSplitter {
  chunkSize: number;
  overlap: number;
  tokenizer: (text: string) => string[];

  constructor(options: TokenChunkingOptions = {}) {
    this.chunkSize = options.chunkSize ?? 256;
    this.overlap = options.overlap ?? 32;
    this.tokenizer = options.tokenizer ?? ((text) => text.split(/\s+/g));
  }

  parse(document: Document): TokenChunk[] {
    const tokens = this.tokenizer(document.content);
    const chunks: TokenChunk[] = [];
    for (let i = 0; i < tokens.length; i += this.chunkSize - this.overlap) {
      const chunkTokens = tokens.slice(i, i + this.chunkSize);
      chunks.push({
        content: chunkTokens.join(' '),
        metadata: { ...document.metadata, chunk_index: chunks.length },
        tokenStart: i,
        tokenEnd: i + chunkTokens.length - 1,
      });
    }
    return chunks;
  }
}

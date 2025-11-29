// LlamaIndex RecursiveCharacterTextSplitter
// Splits text by character, then recursively by smaller units if needed

export interface Document {
  content: string;
  metadata: Record<string, any>;
}

export interface CharChunk {
  content: string;
  metadata: Record<string, any>;
  start: number;
  end: number;
}

export interface RecursiveCharChunkingOptions {
  chunkSize?: number;
  overlap?: number;
  separators?: string[];
}

export class RecursiveCharacterTextSplitter {
  chunkSize: number;
  overlap: number;
  separators: string[];

  constructor(options: RecursiveCharChunkingOptions = {}) {
    this.chunkSize = options.chunkSize ?? 512;
    this.overlap = options.overlap ?? 50;
    this.separators = options.separators ?? ['\n\n', '\n', ' ', ''];
  }

  splitText(text: string, chunkSize: number, overlap: number, separators: string[]): string[] {
    if (text.length <= chunkSize) return [text];
    for (const sep of separators) {
      if (sep && text.includes(sep)) {
        const splits = text.split(sep);
        const chunks: string[] = [];
        let chunk = '';
        for (let i = 0; i < splits.length; i++) {
          if ((chunk + (chunk ? sep : '') + splits[i]).length > chunkSize) {
            if (chunk) chunks.push(chunk);
            chunk = splits[i];
          } else {
            chunk += (chunk ? sep : '') + splits[i];
          }
        }
        if (chunk) chunks.push(chunk);
        // Recursively split chunks that are still too large
        return chunks.flatMap(c =>
          c.length > chunkSize && separators.length > 1
            ? this.splitText(c, chunkSize, overlap, separators.slice(1))
            : [c]
        );
      }
    }
    // Fallback: split by fixed size
    const result: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      result.push(text.slice(i, i + chunkSize));
    }
    return result;
  }

  parse(document: Document): CharChunk[] {
    const chunks = this.splitText(document.content, this.chunkSize, this.overlap, this.separators);
    let idx = 0;
    let pos = 0;
    return chunks.map(chunk => {
      const start = pos;
      const end = pos + chunk.length - 1;
      pos += chunk.length;
      return {
        content: chunk,
        metadata: { ...document.metadata, chunk_index: idx++ },
        start,
        end,
      };
    });
  }
}

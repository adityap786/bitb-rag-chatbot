// LlamaIndex HierarchicalNodeParser (Phase 1.1.3)
// Hierarchical chunking: document → sections → paragraphs

export interface Document {
  content: string;
  metadata: Record<string, any>;
}

export interface HierarchicalChunk {
  content: string;
  metadata: Record<string, any>;
  hierarchy: string[];
}

export interface HierarchicalChunkingOptions {
  sectionPattern?: RegExp;
  paragraphPattern?: RegExp;
  chunkSize?: number;
}

export class HierarchicalNodeParser {
  sectionPattern: RegExp;
  paragraphPattern: RegExp;
  chunkSize: number;

  constructor(options: HierarchicalChunkingOptions = {}) {
    this.sectionPattern = options.sectionPattern ?? /^#+\s.+/gm; // Markdown headings
    this.paragraphPattern = options.paragraphPattern ?? /\n\s*\n/gm;
    this.chunkSize = options.chunkSize ?? 512;
  }

  parse(document: Document): HierarchicalChunk[] {
    // Split into sections (by heading)
    const sections = document.content.split(this.sectionPattern);
    const sectionMatches = [...document.content.matchAll(this.sectionPattern)].map(m => m[0]);
    const chunks: HierarchicalChunk[] = [];
    for (let i = 0; i < sections.length; i++) {
      const sectionTitle = sectionMatches[i - 1] || 'Document';
      const sectionContent = sections[i];
      // Split section into paragraphs
      const paragraphs = sectionContent.split(this.paragraphPattern).filter(p => p.trim().length > 0);
      for (let j = 0; j < paragraphs.length; j++) {
        const para = paragraphs[j];
        // If paragraph is too long, further split
        if (para.length > this.chunkSize) {
          for (let k = 0; k < para.length; k += this.chunkSize) {
            const chunkText = para.slice(k, k + this.chunkSize);
            chunks.push({
              content: chunkText,
              metadata: { ...document.metadata, chunk_index: chunks.length },
              hierarchy: ['Document', sectionTitle.trim(), `Paragraph ${j + 1}`],
            });
          }
        } else {
          chunks.push({
            content: para,
            metadata: { ...document.metadata, chunk_index: chunks.length },
            hierarchy: ['Document', sectionTitle.trim(), `Paragraph ${j + 1}`],
          });
        }
      }
    }
    return chunks;
  }
}

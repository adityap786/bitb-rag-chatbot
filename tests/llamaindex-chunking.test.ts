import { describe, it, expect } from 'vitest';
import { SentenceSplitter } from '../src/lib/rag/llamaindex-chunking.js';

describe('SentenceSplitter', () => {
  const doc = {
    content: 'This is the first sentence. Here is the second! Is this the third? Yes, it is. And here is a very long sentence that should be chunked separately because it exceeds the chunk size limit. The end.',
    metadata: { url: 'test.md', title: 'Test Doc' },
  };

  it('splits into chunks with overlap', () => {
    const splitter = new SentenceSplitter({ chunkSize: 50, chunkOverlap: 10 });
    const chunks = splitter.split(doc);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.length).toBeLessThanOrEqual(50 + 10);
    expect(chunks[1].content.startsWith(chunks[0].content.slice(-10))).toBe(true);
  });

  it('handles short docs as single chunk', () => {
    const splitter = new SentenceSplitter({ chunkSize: 500 });
    const chunks = splitter.split(doc);
    expect(chunks.length).toBe(1);
  });
});

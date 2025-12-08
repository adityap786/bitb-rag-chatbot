import { describe, it, expect } from 'vitest';
import { RecursiveCharacterTextSplitter } from '../src/lib/rag/llamaindex-recursive-char-chunking.js';

describe('RecursiveCharacterTextSplitter', () => {
  const doc = {
    content: 'Para1\n\nPara2\n\nPara3 with more text to force splitting. '.repeat(3),
    metadata: { url: 'char.md', title: 'Char Doc' },
  };

  it('splits recursively by separator and size', () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 40, overlap: 5 });
    const chunks = splitter.parse(doc);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].content.length).toBeLessThanOrEqual(40);
    expect(chunks[1].start).toBe(chunks[0].end + 1);
  });
});

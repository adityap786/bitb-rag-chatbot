import { describe, it, expect } from 'vitest';
import { TokenSplitter } from '../src/lib/rag/llamaindex-token-chunking';

describe('TokenSplitter', () => {
  const doc = {
    content: 'This is a test document with enough tokens to create several chunks for testing token-based chunking.',
    metadata: { url: 'token.md', title: 'Token Doc' },
  };

  it('splits into token-based chunks with overlap', () => {
    const parser = new TokenSplitter({ chunkSize: 8, overlap: 2 });
    const chunks = parser.parse(doc);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.split(' ').length).toBeLessThanOrEqual(8);
    expect(chunks[1].tokenStart).toBe(chunks[0].tokenEnd - 1);
  });
});

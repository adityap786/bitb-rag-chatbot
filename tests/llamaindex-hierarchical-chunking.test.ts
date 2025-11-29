import { describe, it, expect } from 'vitest';
import { HierarchicalNodeParser } from '../src/lib/rag/llamaindex-hierarchical-chunking.js';

describe('HierarchicalNodeParser', () => {
  const doc = {
    content: '# Section 1\nThis is the first paragraph.\n\nThis is the second paragraph.\n# Section 2\nThis is the third paragraph, which is very long and should be split into multiple chunks if the chunk size is small enough. '.repeat(2),
    metadata: { url: 'hier.md', title: 'Hier Doc' },
  };

  it('splits into hierarchical chunks', () => {
    const parser = new HierarchicalNodeParser({ chunkSize: 40 });
    const chunks = parser.parse(doc);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].hierarchy[1]).toMatch(/Section/);
    expect(chunks[0].content.length).toBeLessThanOrEqual(40);
  });
});

import { describe, it, expect } from 'vitest';
import { SemanticSplitterNodeParser } from '../src/lib/rag/llamaindex-semantic-chunking';

describe('SemanticSplitterNodeParser', () => {
  const doc = {
    content: 'Alpha. Beta. Gamma. Delta. Epsilon. Zeta. Eta. Theta. Iota. Kappa. Lambda. Mu. Nu. Xi. Omicron. Pi. Rho. Sigma. Tau. Upsilon. Phi. Chi. Psi. Omega.',
    metadata: { url: 'greek.md', title: 'Greek Letters' },
  };

  it('splits into semantic chunks (placeholder)', async () => {
    const parser = new SemanticSplitterNodeParser({ chunkSize: 30, bufferSize: 5 });
    const chunks = await parser.split(doc);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.length).toBeLessThanOrEqual(35);
    expect(chunks[1].content.startsWith(chunks[0].content.slice(-5))).toBe(true);
  });
});

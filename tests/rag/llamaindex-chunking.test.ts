import { SentenceSplitter, Document } from '../../src/lib/rag/llamaindex-chunking';

describe('SentenceSplitter', () => {
  const doc: Document = {
    content: 'Hello world! This is a test. Here is another sentence. Short. The end.',
    metadata: { id: 'doc1' },
  };

  it('splits into chunks with default size/overlap', () => {
    const splitter = new SentenceSplitter();
    const chunks = splitter.split(doc);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(512);
    }
  });

  it('respects chunkSize and chunkOverlap', () => {
    const splitter = new SentenceSplitter({ chunkSize: 20, chunkOverlap: 5 });
    const chunks = splitter.split(doc);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(25); // chunkSize + chunkOverlap
    }
  });

  it('supports multi-language (fallback)', () => {
    const splitter = new SentenceSplitter({ language: 'es' });
    const chunks = splitter.split({ ...doc, content: '¡Hola mundo! Esto es una prueba. Fin.' });
    expect(chunks.length).toBeGreaterThan(0);
  });
});

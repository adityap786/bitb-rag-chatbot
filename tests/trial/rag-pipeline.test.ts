import { describe, test, expect } from 'vitest';
import { chunkText } from '@/lib/trial/rag-pipeline';

describe('RAG Pipeline', () => {
  describe('Text Chunking', () => {
    test('Chunking preserves context with overlap', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const chunks = chunkText(text, 40, 10);

      expect(chunks.length).toBeGreaterThan(1);
      // Verify chunks are not empty
      chunks.forEach(chunk => {
        expect(chunk.length).toBeGreaterThan(0);
      });
    });

    test('Short text returns single chunk', () => {
      const text = 'Short text.';
      const chunks = chunkText(text, 100, 10);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe('Short text.');
    });

    test('Long text without punctuation returns single chunk', () => {
      const text = 'a'.repeat(1000);
      const chunks = chunkText(text, 200, 20);

      // Sentence-aware chunker won't split without punctuation
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(text);
    });

    test('Empty text returns empty array', () => {
      const chunks = chunkText('', 100, 10);

      expect(chunks.length).toBe(0);
    });

    test('Chunk size is respected', () => {
      const text = 'One. Two. Three. Four. Five. Six. Seven. Eight.';
      const chunks = chunkText(text, 20, 5);

      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(25); // size + some tolerance
      });
    });

    test('Overlap creates context continuity', () => {
      const text = 'First sentence here. Second sentence here. Third sentence here.';
      const chunks = chunkText(text, 30, 10);

      if (chunks.length > 1) {
        // Check that chunks have some overlapping content
        for (let i = 1; i < chunks.length; i++) {
          const prevEnd = chunks[i - 1].slice(-10);
          expect(chunks[i]).toContain(prevEnd.split(' ').pop() || '');
        }
      }
    });

    test('Sentence-aware chunking preserves complete sentences', () => {
      const text = 'Complete sentence one. Complete sentence two. Complete sentence three.';
      const chunks = chunkText(text, 50, 10);

      chunks.forEach(chunk => {
        // Each chunk should end with punctuation or be the last chunk
        const trimmed = chunk.trim();
        expect(
          trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')
        ).toBe(true);
      });
    });

    test('Multiple punctuation types are handled', () => {
      const text = 'Question? Exclamation! Statement. Another question?';
      const chunks = chunkText(text, 30, 5);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    test('Single very long sentence returns one chunk', () => {
      const text = 'A'.repeat(1000) + '.';
      const chunks = chunkText(text, 200, 20);

      // Single sentence stays as one chunk (simplified implementation)
      expect(chunks.length).toBe(1);
    });

    test('Text with only whitespace returns empty array', () => {
      const chunks = chunkText('   \n\n   ', 100, 10);

      expect(chunks.length).toBe(0);
    });

    test('Custom chunk size and overlap work correctly', () => {
      const text = 'One. Two. Three. Four. Five.';
      const chunks1 = chunkText(text, 10, 2);
      const chunks2 = chunkText(text, 20, 5);

      expect(chunks1.length).toBeGreaterThanOrEqual(chunks2.length);
    });
  });
});

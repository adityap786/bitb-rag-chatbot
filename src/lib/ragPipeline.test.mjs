import { describe, it, expect } from 'vitest';
import { reviewPlaybookOutput } from './previewPlaybook.js';

describe('reviewPlaybookOutput (ESM)', () => {
	it('returns arrays for chunks and embeddings', () => {
		const { chunks, embeddings } = reviewPlaybookOutput();
		expect(Array.isArray(chunks)).toBe(true);
		expect(Array.isArray(embeddings)).toBe(true);
	});
});

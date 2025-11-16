import { describe, it, expect } from 'vitest';
const { reviewPlaybookOutput } = require('./ragPipeline');

describe('reviewPlaybookOutput (CJS)', () => {
	it('returns arrays for chunks and embeddings', () => {
		const { chunks, embeddings } = reviewPlaybookOutput();
		expect(Array.isArray(chunks)).toBe(true);
		expect(Array.isArray(embeddings)).toBe(true);
	});
});

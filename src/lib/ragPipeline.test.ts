import { describe, it, expect } from 'vitest';
import { reviewPlaybookOutput } from './ragPipeline';

describe('reviewPlaybookOutput', () => {
	it('returns chunks and embeddings arrays', () => {
		const { chunks, embeddings } = reviewPlaybookOutput();
		expect(Array.isArray(chunks)).toBe(true);
		expect(Array.isArray(embeddings)).toBe(true);
	});
});

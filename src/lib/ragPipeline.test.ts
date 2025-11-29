import { describe, it, expect } from 'vitest';
import { reviewPlaybookOutput } from './previewPlaybook';
import { batchMcpHybridRagQuery } from '@/lib/ragPipeline';

describe('reviewPlaybookOutput', () => {
	it('returns chunks and embeddings arrays', () => {
		const { chunks, embeddings } = reviewPlaybookOutput();
		expect(Array.isArray(chunks)).toBe(true);
		expect(Array.isArray(embeddings)).toBe(true);
	});
});

describe('batchMcpHybridRagQuery', () => {
	it('returns responses for multiple queries in order', async () => {
		const tenantId = 'tn_' + 'a'.repeat(32);
		const queries = [
			'What is Bits and Bytes Pvt Ltd?',
			'Describe the Service Desk plan.',
			'How does the trial workflow work?'
		];
		const responses = await batchMcpHybridRagQuery({ tenantId, queries });
		expect(Array.isArray(responses)).toBe(true);
		expect(responses.length).toBe(queries.length);
		responses.forEach((resp, idx) => {
			expect(resp).toHaveProperty('answer');
			expect(typeof resp.answer).toBe('string');
		});
	}, 30000); // Increased timeout to 30s to handle LangCache retries and network delays

	it('handles empty queries array', async () => {
		const tenantId = 'tn_' + 'a'.repeat(32);
		const queries: string[] = [];
		const responses = await batchMcpHybridRagQuery({ tenantId, queries });
		expect(Array.isArray(responses)).toBe(true);
		expect(responses.length).toBe(0);
	});
});

import { describe, it, expect } from 'vitest';
import { sanitizeCitationMarkers, extractCitationIndices } from '../../src/lib/rag/sanitize-response';

describe('sanitizeCitationMarkers', () => {
    it('removes single-digit citation markers', () => {
        const input = 'Based on [1] the answer is yes.';
        expect(sanitizeCitationMarkers(input)).toBe('Based on the answer is yes.');
    });

    it('removes multi-digit citation markers', () => {
        const input = 'See [12] and [23] for details.';
        expect(sanitizeCitationMarkers(input)).toBe('See and for details.');
    });

    it('removes markers with spaces inside brackets', () => {
        const input = 'According to [ 3 ], this is correct.';
        expect(sanitizeCitationMarkers(input)).toBe('According to, this is correct.');
    });

    it('removes [n] placeholder markers', () => {
        const input = 'Reference [n] shows the data.';
        expect(sanitizeCitationMarkers(input)).toBe('Reference shows the data.');
    });

    it('cleans up double spaces after removal', () => {
        const input = 'The  [1]  answer  is  [2]  here.';
        expect(sanitizeCitationMarkers(input)).toBe('The answer is here.');
    });

    it('handles empty string', () => {
        expect(sanitizeCitationMarkers('')).toBe('');
    });

    it('handles null/undefined gracefully', () => {
        expect(sanitizeCitationMarkers(null as any)).toBe('');
        expect(sanitizeCitationMarkers(undefined as any)).toBe('');
    });

    it('fixes punctuation artifacts', () => {
        const input = 'See [1], [2], and [3] for details.';
        expect(sanitizeCitationMarkers(input)).toBe('See, and for details.');
    });
});

describe('extractCitationIndices', () => {
    it('extracts unique citation indices', () => {
        const input = 'Based on [1] and [2], see also [1] for more.';
        expect(extractCitationIndices(input)).toEqual([1, 2]);
    });

    it('returns sorted indices', () => {
        const input = 'See [5], [2], [10], and [1].';
        expect(extractCitationIndices(input)).toEqual([1, 2, 5, 10]);
    });

    it('handles no citations', () => {
        expect(extractCitationIndices('No citations here')).toEqual([]);
    });

    it('handles empty string', () => {
        expect(extractCitationIndices('')).toEqual([]);
    });
});

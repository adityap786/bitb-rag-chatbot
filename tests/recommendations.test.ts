
import { describe, it, expect } from 'vitest';
import { getRecommendations } from '../src/lib/recommendations/engine';

describe('Recommendations engine', () => {
  it('returns recommendations based on recent queries', () => {
    const recs = getRecommendations({ recentQueries: ['headphones', 'electronics'] });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].type).toBeDefined();
  });

  it('returns default recommendations if no match', () => {
    const recs = getRecommendations({ recentQueries: ['unknown'] });
    expect(recs.length).toBe(2);
  });
});

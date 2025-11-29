
import { describe, it, expect } from 'vitest';
import { scoreConversation, getScores } from '../src/lib/analytics/scoring';

describe('Conversation scoring', () => {
  it('scores a positive conversation', () => {
    const score = scoreConversation('sess1', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi, how can I help?' },
      { role: 'user', content: 'I need info' },
      { role: 'assistant', content: 'Here is the info.' }
    ], 'good');
    expect(score.score).toBeGreaterThan(0);
  });

  it('scores a negative conversation', () => {
    const score = scoreConversation('sess2', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Error: something went wrong' }
    ], 'bad');
    expect(score.score).toBeLessThan(2);
  });

  it('getScores returns all scores', () => {
    const allScores = getScores();
    expect(allScores.length).toBeGreaterThan(0);
  });
});

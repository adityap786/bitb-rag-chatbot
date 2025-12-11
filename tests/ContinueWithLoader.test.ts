import { describe, expect, it } from 'vitest';
import { formatEtaDuration } from '@/lib/trial/multi-step-loader';

describe('formatEtaDuration', () => {
  it('returns null for missing or non-positive estimates', () => {
    expect(formatEtaDuration(undefined)).toBeNull();
    expect(formatEtaDuration(-100)).toBeNull();
  });

  it('formats short durations in seconds', () => {
    expect(formatEtaDuration(12000)).toBe('About 12s remaining');
  });

  it('includes minutes for longer durations', () => {
    expect(formatEtaDuration(125000)).toBe('About 2m 5s remaining');
  });
});

import { describe, expect, it } from 'vitest';
import { calculateStepProgress, createInitialStepState } from '@/lib/trial/multi-step-loader';

describe('calculateStepProgress', () => {
  it('starts at zero when no steps have run', () => {
    const steps = createInitialStepState();
    expect(calculateStepProgress(steps)).toBe(0);
  });

  it('returns 99 until the done step finalizes', () => {
    const steps = createInitialStepState();
    ['setup', 'ingestion', 'chunking', 'embedding', 'storing'].forEach((step) => {
      steps[step as keyof typeof steps].status = 'completed';
    });
    expect(calculateStepProgress(steps)).toBe(99);
  });

  it('hits 100 when the done step completes', () => {
    const steps = createInitialStepState();
    steps['done'].status = 'completed';
    expect(calculateStepProgress(steps)).toBe(100);
  });
});

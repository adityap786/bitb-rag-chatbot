import type { IngestionStepKey } from '@/types/ingestion';
import { INGESTION_STEP_ORDER } from '@/types/ingestion';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepState {
  status: StepStatus;
  etaMs?: number | null;
  message?: string | null;
  timestamp: string;
}

export type StepStateMap = Record<IngestionStepKey, StepState>;

export function createInitialStepState(): StepStateMap {
  const now = new Date().toISOString();
  return INGESTION_STEP_ORDER.reduce((acc, step) => {
    acc[step] = {
      status: 'pending',
      timestamp: now,
    };
    return acc;
  }, {} as StepStateMap);
}

export function calculateStepProgress(steps: Partial<StepStateMap>): number {
  const orderedSteps = INGESTION_STEP_ORDER.filter((step) => step !== 'done');
  if (!orderedSteps.length) return 0;

  if (steps.done?.status === 'completed') {
    return 100;
  }

  let completed = 0;
  for (const step of orderedSteps) {
    if (steps[step]?.status === 'completed') {
      completed += 1;
      continue;
    }
    break;
  }

  const runningIndex = orderedSteps.findIndex((step) => steps[step]?.status === 'running');
  const base = (completed / orderedSteps.length) * 100;
  if (runningIndex >= 0) {
    const stepWeight = 100 / orderedSteps.length;
    const buffered = Math.min(base + stepWeight * 0.6, 99);
    return Math.round(Math.max(buffered, base));
  }

  if (completed === orderedSteps.length) {
    return 99;
  }

  return Math.round(Math.min(Math.max(base, 0), 99));
}

export function formatEtaDuration(etaMs?: number | null): string | null {
  if (!etaMs || etaMs <= 0) return null;
  const seconds = Math.max(1, Math.round(etaMs / 1000));
  if (seconds < 60) {
    return `About ${seconds}s remaining`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `About ${minutes}m remaining`;
  }
  return `About ${minutes}m ${remainingSeconds}s remaining`;
}

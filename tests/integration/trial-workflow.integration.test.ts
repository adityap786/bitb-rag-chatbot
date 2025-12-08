import { describe, it, expect, beforeAll } from 'vitest';

// Use dynamic import for the workflow engine to avoid static type errors
let startTrialWorkflow: any;
let getTrialStatus: any;

const TEST_TENANT_ID = 'trial-tenant-integration';

describe('Trial Workflow Integration', () => {
  let trialId: string;

  beforeAll(async () => {
    const mod: any = await import('@/lib/trial/workflow-engine');
    startTrialWorkflow = mod.startTrialWorkflow;
    getTrialStatus = mod.getTrialStatus;
    trialId = await startTrialWorkflow({ tenant_id: TEST_TENANT_ID });
  });

  it('should start a trial and return status', async () => {
    const status = await getTrialStatus(trialId);
    expect(status).toBeDefined();
    expect(status.state).toMatch(/started|in_progress|completed/);
  });

  it('should complete workflow steps', async () => {
    // Simulate KB upload, RAG query, etc.
    // ...existing code...
    const status = await getTrialStatus(trialId);
    expect(status.state).toBe('completed');
  });
});

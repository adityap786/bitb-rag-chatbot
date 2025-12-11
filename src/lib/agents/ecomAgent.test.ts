import { describe, it, expect, vi } from 'vitest';
import { EcomReACTAgent, prefetchOnboardingData } from './ecomAgent';

// Mock Redis client to prevent top-level throw when env vars are missing
vi.mock('../redis-client-upstash', () => {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    const { Redis } = require('@upstash/redis');
    return {
      upstashRedis: new Redis({ url: redisUrl, token: redisToken }),
    };
  }

  return {
    upstashRedis: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    }
  };
});

describe('EcomReACTAgent Onboarding Flow', () => {
  const tenantId = 'tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  const redisConfigured = !!(redisUrl && redisToken);

  (redisConfigured ? it : it.skip)('should orchestrate onboarding and payment redirection', async () => {
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    const result = await agent.run('onboarding');
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(result.finalAnswer).toMatch(/onboarding complete/i);
    const paymentStep = result.steps.find(s => s.action === 'payment_link');
    expect(paymentStep).toBeDefined();
    expect(paymentStep?.observation?.data?.payment_url).toMatch(/^https?:\/\//);
  });

  (redisConfigured ? it : it.skip)('should cache onboarding results for repeated requests', async () => {
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    const first = await agent.run('onboarding');
    const second = await agent.run('onboarding');
    expect(second.finalAnswer).toEqual(first.finalAnswer);
    expect(second.steps.length).toEqual(first.steps.length);
  });

  (redisConfigured ? it : it.skip)('should prefetch onboarding data without error', async () => {
    await expect(prefetchOnboardingData(tenantId)).resolves.not.toThrow();
  });
});

describe('EcomReACTAgent Additional Scenarios', () => {
  const tenantId = 'tn_test_scenarios';
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisConfigured = !!(redisUrl && redisToken);

  it('should propagate errors from tool handler', async () => {
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    // Patch ECOM_TOOLS to throw
    const orig = agent["executeTool"];
    agent["executeTool"] = async () => { throw new Error('Simulated tool error'); };
    await expect(agent.run('catalog')).rejects.toThrow('Simulated tool error');
    agent["executeTool"] = orig;
  });

  (redisConfigured ? it : it.skip)('should handle onboarding job failure and step back', async () => {
    // Use a unique query to avoid cache
    const uniqueQuery = 'onboarding ' + Math.random();
    // Simulate polling: job is pending, then fails, and always fails (should hit max step backs)
    const fakeJobFailed = { id: 'fake', name: 'catalog_ingestion', finishedOn: Date.now(), failedReason: undefined, returnvalue: { status: 'failed: Simulated failure' } };
    const mockQueue = {
      add: async () => fakeJobFailed,
      getJob: async () => fakeJobFailed,
    };
    const agent = new EcomReACTAgent(tenantId, 'ecom', { onboardingQueue: mockQueue });
    await expect(agent.run(uniqueQuery)).rejects.toThrow(/Simulated failure/);
  });

  (redisConfigured ? it : it.skip)('should step back and succeed if failure is transient', async () => {
    // Simulate polling: first attempt fails, second attempt succeeds
    let callCount = 0;
    const fakeJobFailed = { id: 'fake', name: 'catalog_ingestion', finishedOn: Date.now(), failedReason: undefined, returnvalue: { status: 'failed: Simulated failure' } };
    const fakeJobSuccess = { id: 'fake', name: 'catalog_ingestion', finishedOn: Date.now(), failedReason: undefined, returnvalue: { status: 'success' } };
    const mockQueue = {
      add: async () => {
        callCount++;
        return callCount === 1 ? fakeJobFailed : fakeJobSuccess;
      },
      getJob: async () => {
        return callCount === 1 ? fakeJobFailed : fakeJobSuccess;
      },
    };
    const agent = new EcomReACTAgent(tenantId, 'ecom', { onboardingQueue: mockQueue });
    const result = await agent.run('onboarding');
    expect(result.finalAnswer).toMatch(/onboarding complete/i);
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('should fallback if payment link is unavailable', async () => {
    // Use a unique query to avoid cache
    const uniqueQuery = 'onboarding ' + Math.random();
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    // Patch executeTool to simulate payment_link failure
    const orig = agent["executeTool"];
    agent["executeTool"] = async (action, input) => {
      if (action === 'payment_link') return { success: false };
      // For onboarding jobs, always return success to avoid triggering step back
      if (action === 'catalog_ingestion' || action === 'update_settings') return { success: true, data: { status: 'success' } };
      return orig.call(agent, action, input);
    };
    const result = await agent.run(uniqueQuery);
    expect(result.finalAnswer).toMatch(/Payment link unavailable/i);
    agent["executeTool"] = orig;
  });

  it('should execute inventory sync flow', async () => {
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    const result = await agent.run('inventory');
    expect(result.steps.length).toBe(1);
    expect(result.finalAnswer).toMatch(/completed|action completed/i);
  });
});

describe('EcomReACTAgent Full Architecture', () => {
  const tenantId = 'tn_test_full_arch';
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisConfigured = !!(redisUrl && redisToken);

  it('should select the correct tool for catalog queries', async () => {
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    expect(agent["selectTool"]('catalog')).toBe('catalog_ingestion');
    expect(agent["selectTool"]('pay')).toBe('payment_link');
    expect(agent["selectTool"]('inventory')).toBe('inventory_sync');
    expect(agent["selectTool"]('track order')).toBe('order_tracking');
  });

  it('should execute a single tool action (non-onboarding)', async () => {
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    const result = await agent.run('catalog');
    expect(result.steps.length).toBe(1);
    expect(result.finalAnswer).toMatch(/catalog ingestion started|action completed/i);
  });

  it('should throw for unknown tool', async () => {
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    // Patch selectTool to return a bogus tool
    agent["selectTool"] = () => 'not_a_real_tool';
    await expect(agent.run('something bogus')).rejects.toThrow(/Tool not found/);
  });

  it('should enforce tenant type access control', () => {
    expect(() => new EcomReACTAgent(tenantId, 'not_ecom')).toThrow(/Access denied/);
  });

  (redisConfigured ? it : it.skip)('should orchestrate async onboarding and cache result (full arch)', async () => {
    const agent = new EcomReACTAgent(tenantId, 'ecom');
    const result = await agent.run('onboarding');
    expect(result.steps.map(s => s.action)).toEqual([
      'catalog_ingestion',
      'update_settings',
      'payment_link',
    ]);
    expect(result.finalAnswer).toMatch(/onboarding complete/i);
    // Run again to test cache
    const cached = await agent.run('onboarding');
    expect(cached.finalAnswer).toEqual(result.finalAnswer);
  });
});

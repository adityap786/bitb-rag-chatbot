import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-fetch (used dynamically inside RolloutManager)
vi.mock('node-fetch', () => ({ default: vi.fn() }));

import RolloutManager from '../../src/lib/rollout/manager';

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.PROMETHEUS_URL;
  delete process.env.PROMETHEUS_BEARER_TOKEN;
});

afterEach(() => {
  delete process.env.PROMETHEUS_URL;
  delete process.env.PROMETHEUS_BEARER_TOKEN;
});

describe('RolloutManager.evaluatePrometheusGate', () => {
  it('allows promotion by default when no PROMETHEUS_URL', async () => {
    const mgr = new RolloutManager();
    const res = await mgr.evaluatePrometheusGate({ query: 'up', threshold: 1 });
    expect(res.ok).toBe(true);
    expect(res.value).toBeNull();
  });

  it('queries Prometheus and returns ok=true when avg < threshold', async () => {
    process.env.PROMETHEUS_URL = 'http://prometheus.local';
    const fetchModule = await import('node-fetch');
    const mockFetch: any = fetchModule.default;

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      status: 'success',
      data: {
        result: [
          { values: [[now - 60, '0.005'], [now - 30, '0.007']] },
          { values: [[now - 50, '0.002']] }
        ]
      }
    };

    mockFetch.mockResolvedValue({ json: async () => payload, status: 200 });

    const mgr = new RolloutManager();
    const res = await mgr.evaluatePrometheusGate({ query: 'rate(http_requests[5m])', threshold: 0.01, lookbackSec: 120 });
    expect(res.ok).toBe(true);
    expect(typeof res.value).toBe('number');
    expect(res.value).toBeGreaterThan(0);
    // average should be around (0.005+0.007+0.002)/3
    expect(res.value).toBeCloseTo((0.005 + 0.007 + 0.002) / 3, 5);
  });

  it('returns ok=false when avg >= threshold', async () => {
    process.env.PROMETHEUS_URL = 'http://prometheus.local';
    const fetchModule = await import('node-fetch');
    const mockFetch: any = fetchModule.default;

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      status: 'success',
      data: {
        result: [
          { values: [[now - 60, '0.02'], [now - 30, '0.03']] }
        ]
      }
    };

    mockFetch.mockResolvedValue({ json: async () => payload, status: 200 });

    const mgr = new RolloutManager();
    const res = await mgr.evaluatePrometheusGate({ query: 'rate(http_requests[5m])', threshold: 0.01, lookbackSec: 120 });
    expect(res.ok).toBe(false);
    expect(res.value).toBeGreaterThanOrEqual(0.02);
  });
});

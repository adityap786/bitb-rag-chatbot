
import { describe, it, expect } from 'vitest';
import { recordMetric, getMetrics } from '../src/lib/analytics/metrics';

describe('Analytics metrics', () => {
  it('records and retrieves metrics', () => {
    recordMetric('response_time', 120);
    recordMetric('user_satisfaction', 4.5);
    const metrics = getMetrics();
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0].name).toBeDefined();
    expect(metrics[0].value).toBeDefined();
  });
});

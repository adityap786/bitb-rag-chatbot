/**
 * Simple telemetry for RAG pipeline metrics.
 * Logs structured JSON to stdout for aggregation.
 */

type MetricTags = Record<string, string | number | boolean>;

export const metrics = {
  timing: (name: string, durationMs: number, tags: MetricTags = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      type: 'metric',
      metric_type: 'timing',
      name,
      value: durationMs,
      unit: 'ms',
      timestamp: new Date().toISOString(),
      ...tags,
    }));
  },

  histogram: (name: string, value: number, tags: MetricTags = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      type: 'metric',
      metric_type: 'histogram',
      name,
      value,
      unit: 'value',
      timestamp: new Date().toISOString(),
      ...tags,
    }));
  },

  counter: (name: string, value: number = 1, tags: MetricTags = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      type: 'metric',
      metric_type: 'counter',
      name,
      value,
      unit: 'count',
      timestamp: new Date().toISOString(),
      ...tags,
    }));
  },

  increment: (name: string, tags: MetricTags = {}) => {
    // Alias for counter with default increment of 1
    metrics.counter(name, 1, tags);
  },

  error: (name: string, error: any, tags: MetricTags = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      type: 'metric',
      metric_type: 'error',
      name,
      message: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      ...tags,
    }));
  },
};

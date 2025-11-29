/**
 * Lightweight metrics collection for embedding operations.
 * Tracks counters, timings, and gauges for observability.
 * Can be integrated with Prometheus, Datadog, or custom monitoring.
 */

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();
  private enabled: boolean = process.env.ENABLE_METRICS !== 'false';

  // Increment a counter
  incr(name: string, value: number = 1, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  // Record a timing (milliseconds)
  timing(name: string, durationMs: number, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(durationMs);
    this.histograms.set(key, values);
  }

  // Set a gauge value
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  // Get all metrics as a snapshot
  snapshot(): { counters: Record<string, number>; histograms: Record<string, number[]>; gauges: Record<string, number> } {
    return {
      counters: Object.fromEntries(this.counters),
      histograms: Object.fromEntries(this.histograms),
      gauges: Object.fromEntries(this.gauges),
    };
  }

  // Reset all metrics
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  // Log metrics summary to console
  logSummary(): void {
    if (!this.enabled) return;
    console.log('[metrics] Counters:', Object.fromEntries(this.counters));
    console.log('[metrics] Gauges:', Object.fromEntries(this.gauges));
    const histSummary: Record<string, any> = {};
    for (const [key, values] of this.histograms.entries()) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      histSummary[key] = {
        count: values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p50: sorted[Math.floor(values.length * 0.5)],
        p95: sorted[Math.floor(values.length * 0.95)],
        p99: sorted[Math.floor(values.length * 0.99)],
      };
    }
    console.log('[metrics] Histograms:', histSummary);
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

export const metrics = new MetricsCollector();

// Helper for timing async functions
export async function timeAsync<T>(name: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    metrics.timing(name, Date.now() - start, labels);
    return result;
  } catch (err) {
    metrics.timing(name, Date.now() - start, { ...labels, error: 'true' });
    throw err;
  }
}

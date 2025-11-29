
/**
 * Analytics Metrics System
 * 
 * PRODUCTION NOTES:
 * - Currently uses in-memory storage for demo purposes
 * - TODO: Replace with Supabase/Postgres for production
 * - TODO: Add tenant isolation (multi-tenancy)
 * - TODO: Implement time-series database (e.g., TimescaleDB, InfluxDB)
 * - TODO: Add metric aggregation and rollups
 * - TODO: Add alerting thresholds
 */

export interface AnalyticsMetric {
  name: string;
  value: number;
  timestamp: string;
  tenantId?: string;
  tags?: Record<string, string>;
}

export class MetricsError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_INPUT' | 'DB_ERROR' | 'UNKNOWN',
    public details?: any
  ) {
    super(message);
    this.name = 'MetricsError';
  }
}

/**
 * TEMPORARY: In-memory storage
 * WARNING: Data will be lost on server restart
 * Replace with persistent database in production
 */
const METRICS: AnalyticsMetric[] = [];

/**
 * Record a metric value
 * 
 * @param name - Metric name (e.g., 'response_time', 'token_count')
 * @param value - Numeric value
 * @param options - Additional options
 * @throws MetricsError if input is invalid
 */
export function recordMetric(
  name: string, 
  value: number,
  options?: {
    tenantId?: string;
    tags?: Record<string, string>;
  }
): void {
  // Input validation
  if (!name || typeof name !== 'string') {
    throw new MetricsError('Metric name is required', 'INVALID_INPUT');
  }

  if (typeof value !== 'number' || isNaN(value)) {
    throw new MetricsError('Metric value must be a valid number', 'INVALID_INPUT');
  }

  // Sanity check: prevent extreme values
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new MetricsError(
      'Metric value exceeds safe integer range',
      'INVALID_INPUT',
      { value }
    );
  }

  try {
    METRICS.push({ 
      name: name.toLowerCase().trim(), 
      value, 
      timestamp: new Date().toISOString(),
      tenantId: options?.tenantId,
      tags: options?.tags
    });
  } catch (error) {
    throw new MetricsError(
      'Failed to record metric',
      'DB_ERROR',
      error
    );
  }
}

/**
 * Get all metrics
 * 
 * @param options - Filter options
 * @returns Array of metrics
 */
export function getMetrics(options?: {
  name?: string;
  tenantId?: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
}): AnalyticsMetric[] {
  try {
    let results = METRICS;

    // Filter by metric name
    if (options?.name) {
      results = results.filter(m => m.name === options.name?.toLowerCase().trim());
    }

    // Filter by tenant
    if (options?.tenantId) {
      results = results.filter(m => m.tenantId === options.tenantId);
    }

    // Filter by time range
    if (options?.startTime) {
      const start = new Date(options.startTime).getTime();
      results = results.filter(m => new Date(m.timestamp).getTime() >= start);
    }

    if (options?.endTime) {
      const end = new Date(options.endTime).getTime();
      results = results.filter(m => new Date(m.timestamp).getTime() <= end);
    }

    // Limit
    if (options?.limit && options.limit > 0) {
      results = results.slice(-options.limit); // Get most recent
    }

    return results;
  } catch (error) {
    throw new MetricsError(
      'Failed to retrieve metrics',
      'DB_ERROR',
      error
    );
  }
}

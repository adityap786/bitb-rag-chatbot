// Vector DB performance monitoring stub
import { Histogram, register } from 'prom-client';

export const vectorDbQueryLatency = new Histogram({
  name: 'vector_db_query_latency_ms',
  help: 'Latency of vector DB queries in ms',
  labelNames: ['operation', 'status'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
  registers: [register],
});

export function observeVectorDbQuery(operation: string, status: string, ms: number) {
  vectorDbQueryLatency.observe({ operation, status }, ms);
}
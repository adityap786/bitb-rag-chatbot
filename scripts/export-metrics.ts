/**
 * Metrics export utility for Prometheus or custom monitoring.
 * This script can be invoked periodically to export metrics to a file or endpoint.
 * 
 * Usage:
 *   npx tsx scripts/export-metrics.ts
 * Or integrate into API route: GET /api/metrics
 */

import { metrics } from '../src/lib/observability/metrics';

function exportPrometheusFormat(): string {
  const snapshot = metrics.snapshot();
  const lines: string[] = [];

  // Export counters
  for (const [key, value] of Object.entries(snapshot.counters)) {
    lines.push(`# TYPE ${key.split('{')[0]} counter`);
    lines.push(`${key} ${value}`);
  }

  // Export gauges
  for (const [key, value] of Object.entries(snapshot.gauges)) {
    lines.push(`# TYPE ${key.split('{')[0]} gauge`);
    lines.push(`${key} ${value}`);
  }

  // Export histograms as summaries (p50, p95, p99, count)
  for (const [key, values] of Object.entries(snapshot.histograms)) {
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const baseName = key.split('{')[0];
    const labels = key.includes('{') ? key.substring(key.indexOf('{')) : '';
    
    lines.push(`# TYPE ${baseName} summary`);
    lines.push(`${baseName}_count${labels} ${values.length}`);
    lines.push(`${baseName}_sum${labels} ${values.reduce((a, b) => a + b, 0)}`);
    lines.push(`${baseName}{quantile="0.5"${labels.slice(1, -1) ? ',' + labels.slice(1, -1) : ''}} ${sorted[Math.floor(values.length * 0.5)]}`);
    lines.push(`${baseName}{quantile="0.95"${labels.slice(1, -1) ? ',' + labels.slice(1, -1) : ''}} ${sorted[Math.floor(values.length * 0.95)]}`);
    lines.push(`${baseName}{quantile="0.99"${labels.slice(1, -1) ? ',' + labels.slice(1, -1) : ''}} ${sorted[Math.floor(values.length * 0.99)]}`);
  }

  return lines.join('\n');
}

function exportJSON(): string {
  return JSON.stringify(metrics.snapshot(), null, 2);
}

async function main() {
  const format = process.env.METRICS_FORMAT || 'json'; // or 'prometheus'
  
  if (format === 'prometheus') {
    console.log(exportPrometheusFormat());
  } else {
    console.log(exportJSON());
  }
}

main().catch((err) => {
  console.error('Failed to export metrics:', err);
  process.exit(1);
});

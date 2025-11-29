# Telemetry & Monitoring

This document describes the metrics instrumentation added to the embedding pipeline and vector store for observability.

## Metrics Module

Location: `src/lib/observability/metrics.ts`

The metrics module provides a lightweight, in-memory metrics collector that tracks:
- **Counters**: Monotonically increasing values (e.g., rows processed, errors)
- **Timings/Histograms**: Duration measurements with percentile calculations
- **Gauges**: Point-in-time values (e.g., embedding dimensions)

### Usage

```typescript
import { metrics, timeAsync } from '@/lib/observability/metrics';

// Increment a counter
metrics.incr('my_operation.count', 1, { status: 'success' });

// Record a timing
metrics.timing('my_operation.duration_ms', 123, { operation: 'embed' });

// Set a gauge
metrics.gauge('my_queue.size', 42);

// Time an async function automatically
const result = await timeAsync('my_operation', async () => {
  // your async code here
}, { context: 'example' });

// Log all metrics to console
metrics.logSummary();

// Get metrics snapshot for export
const snapshot = metrics.snapshot();
```

## Instrumented Components

### 1. Backfill Script (`scripts/backfill-embeddings-384.ts`)

Metrics tracked:
- `backfill.embedding.batch` (counter): Number of texts embedded per batch, labeled by provider (xenova/http)
- `backfill.embedding.xenova` (timing): Time to compute embeddings using Xenova
- `backfill.embedding.http` (timing): Time to compute embeddings via HTTP service
- `backfill.embedding.dims` (gauge): Embedding dimensions, labeled by model
- `backfill.embedding.empty` (counter): Count of rows with empty embeddings
- `backfill.db.upsert` (timing): Time to upsert each row, labeled by table
- `backfill.rows.processed` (counter): Total rows processed, labeled by table

### 2. Vector Store (`src/lib/rag/supabase-vector-store.ts`)

Metrics tracked:
- `vector_store.upsert` (timing): Time to upsert chunks, labeled by table
- `vector_store.upsert.rows` (counter): Number of rows upserted, labeled by table
- `vector_store.upsert.error` (counter): Number of upsert errors, labeled by table
- `vector_store.query.rpc` (timing): Time for RPC-based vector search, labeled by rpc name
- `vector_store.query.rpc_success` (counter): Successful RPC calls, labeled by rpc name
- `vector_store.query.rpc_error` (counter): Failed RPC calls, labeled by rpc name

## Viewing Metrics

### During Backfill

Metrics are automatically logged at the end of the backfill run:

```bash
npx tsx scripts/backfill-embeddings-384.ts --tables=embeddings --batchSize=64
```

Output includes:
- Counter totals (rows processed, errors, etc.)
- Timing percentiles (p50, p95, p99, min, max)
- Gauge values (embedding dimensions)

### Export for Monitoring Systems

Export metrics in JSON or Prometheus format:

```bash
# JSON format (default)
npx tsx scripts/export-metrics.ts

# Prometheus format
METRICS_FORMAT=prometheus npx tsx scripts/export-metrics.ts
```

### Integration with Monitoring Systems

**Option 1: Prometheus**
- Create an API endpoint that calls `metrics.snapshot()` and formats as Prometheus text
- Configure Prometheus to scrape the endpoint periodically

**Option 2: Datadog/CloudWatch**
- Periodically export metrics and push to your monitoring service
- Use the metrics snapshot to extract values and send via their SDKs

**Option 3: Custom Logging**
- Call `metrics.logSummary()` periodically or after key operations
- Parse logs and aggregate in your log management system (e.g., ELK, Splunk)

## Configuration

- **Enable/Disable**: Set `ENABLE_METRICS=false` to disable metrics collection (default: enabled)
- **Model Tracking**: The backfill script automatically labels metrics with `embedding_model` and `embedding_dim`
- **Provider Tracking**: Metrics are labeled by provider (xenova/http) and table name for easier filtering

## Alerts & Thresholds (Recommended)

Set up alerts for:
1. **High Error Rate**: `backfill.embedding.empty` or `vector_store.upsert.error` exceeds threshold
2. **Slow Operations**: `backfill.embedding.*` p95 > 5000ms (5s)
3. **RPC Failures**: `vector_store.query.rpc_error` rate > 1% of total queries
4. **Dimension Mismatches**: `backfill.embedding.dims` != 384 (unexpected model output)

## Future Enhancements

- Integrate with `prom-client` for native Prometheus metrics
- Add distributed tracing (OpenTelemetry)
- Add query performance tracking (latency by tenant, query type)
- Track index health and size metrics
- Add cost tracking (API calls, DB operations)

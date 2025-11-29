# Ingestion Queue System

## Overview

Production-ready job queue system using BullMQ and Redis for processing ingestion jobs with:
- ✅ Retry logic with exponential backoff
- ✅ Progress tracking and status updates
- ✅ Prometheus metrics and Langfuse tracing
- ✅ Graceful shutdown and error handling
- ✅ Memory safety and resource limits
- ✅ Health checks and monitoring

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   API Route │────▶│  BullMQ     │────▶│   Worker     │
│             │     │  Queue      │     │              │
└─────────────┘     └─────────────┘     └──────────────┘
                           │                    │
                           │                    ▼
                    ┌──────▼──────┐     ┌──────────────┐
                    │    Redis    │     │   Python     │
                    │             │     │   Ingestion  │
                    └─────────────┘     └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │  Supabase    │
                                        │  (Status)    │
                                        └──────────────┘
```

## Usage

### Queue a Job

```typescript
import { queueIngestionJob } from '@/lib/queues/ingestQueue';

const job = await queueIngestionJob({
  job_id: 'job_abc123',
  tenant_id: 'tn_xyz...',
  trial_token: 'tr_...',
  data_source: {
    type: 'crawl',
    urls: ['https://example.com'],
    crawl_depth: 2,
  },
  priority: 'high', // or 'normal'
});
```

### Check Job Status

```typescript
// Query Supabase
const { data } = await supabase
  .from('ingestion_jobs')
  .select('*')
  .eq('job_id', 'job_abc123')
  .single();

// Status: 'queued' | 'processing' | 'completed' | 'failed'
// Progress: 0-100
```

### Health Check

```bash
curl http://localhost:3000/api/health/queue
```

Response:
```json
{
  "healthy": true,
  "redis": true,
  "queue": true,
  "worker": true,
  "details": {
    "redis_status": "ready",
    "queue_counts": {
      "waiting": 5,
      "active": 2,
      "completed": 100,
      "failed": 3
    },
    "worker_concurrency": 2
  }
}
```

## Configuration

### Environment Variables

```bash
# Required
RAG_REDIS_URL=redis://127.0.0.1:6379

# Optional
PYTHON_EXECUTABLE=python                    # Python interpreter path
INGEST_WORKER_PATH=./python/ingest_worker.py  # Worker script path
```

### Queue Options

```typescript
// Default configuration
{
  attempts: 3,                    // Retry failed jobs 3 times
  backoff: {
    type: 'exponential',         // Exponential backoff
    delay: 5000,                 // Start with 5s delay
  },
  removeOnComplete: { age: 3600 },   // Keep completed jobs for 1 hour
  removeOnFail: { age: 86400 },      // Keep failed jobs for 24 hours
  concurrency: 2,                    // Process 2 jobs concurrently
  lockDuration: 300_000,             // 5-minute lock per job
}
```

## Features

### 1. Retry Logic

Jobs automatically retry on failure:
- Attempt 1: immediate
- Attempt 2: 5 seconds later
- Attempt 3: 25 seconds later (5s * 5)

### 2. Progress Tracking

Worker can emit progress updates:
```python
# Python worker
print("PROGRESS: 25")  # Updates to 25%
print("PROGRESS: 50")  # Updates to 50%
print("PROGRESS: 100") # Updates to 100%
```

### 3. Metrics & Tracing

**Prometheus Metrics:**
- `queue_jobs_total{queue,status}` - Total jobs by status
- `queue_job_duration_seconds{queue,status}` - Job duration histogram
- `ingestion_jobs_total{status}` - Ingestion job counts

**Langfuse Traces:**
- Trace ID = job_id
- Captures duration, status, errors
- Optional (graceful degradation)

### 4. Memory Safety

- **Buffer limits:** 1MB max for stdout/stderr
- **Timeout protection:** 5-minute max per worker
- **Real-time processing:** Progress parsed in chunks
- **Error truncation:** Max 1000 chars logged

### 5. Graceful Shutdown

```typescript
import '@/lib/queues/shutdown-handler';
```

On SIGTERM/SIGINT:
1. Stop accepting new jobs
2. Wait for active jobs (max 30s)
3. Flush Langfuse traces
4. Close Redis connections
5. Exit cleanly

## Monitoring

### Metrics Dashboard

```promql
# Job throughput (jobs/sec)
rate(queue_jobs_total{queue="ingest",status="completed"}[5m])

# Job failure rate
rate(queue_jobs_total{queue="ingest",status="failed"}[5m]) /
rate(queue_jobs_total{queue="ingest"}[5m])

# P95 job duration
histogram_quantile(0.95, queue_job_duration_seconds{queue="ingest"})

# Queue depth
sum(queue_jobs_total{queue="ingest",status="waiting"})
```

### Alerts

**High Failure Rate:**
```yaml
alert: IngestionJobHighFailureRate
expr: |
  rate(queue_jobs_total{queue="ingest",status="failed"}[5m]) /
  rate(queue_jobs_total{queue="ingest"}[5m]) > 0.1
for: 5m
```

**Queue Backlog:**
```yaml
alert: IngestionQueueBacklog
expr: sum(queue_jobs_total{queue="ingest",status="waiting"}) > 100
for: 10m
```

## Error Handling

### Job Validation Errors

```typescript
// Throws immediately, does not queue
await queueIngestionJob({
  job_id: '',  // ❌ Empty job_id
  // ...
});
// Error: Invalid job_id
```

### Worker Execution Errors

```typescript
// Job retries automatically
{
  status: 'failed',
  error: 'Worker exited with code 1: Python error message',
  attempts: 3,
}
```

### Redis Connection Errors

```typescript
// Logged and retried
logger.error('Failed to connect BullMQ Redis client', { error });
```

## Testing

```bash
# Run unit tests
npm test tests/ingest-queue.test.ts

# Run with coverage
npm test -- --coverage tests/ingest-queue.test.ts
```

Test coverage:
- ✅ Payload validation
- ✅ Priority handling
- ✅ Progress parsing
- ✅ Buffer limits
- ✅ Error truncation
- ✅ Health checks

## Best Practices

### 1. Job Idempotency

Ensure jobs can be safely retried:
```python
# Check if already processed
existing = supabase.table('embeddings').select('*').eq('job_id', job_id).execute()
if existing.data:
    print("Already processed, skipping...")
    exit(0)
```

### 2. Resource Cleanup

Always clean up temporary files:
```python
try:
    process_files()
finally:
    cleanup_temp_files()
```

### 3. Progress Updates

Report progress regularly:
```python
for i, page in enumerate(pages):
    process_page(page)
    progress = int((i + 1) / len(pages) * 100)
    print(f"PROGRESS: {progress}")
```

### 4. Error Context

Provide detailed error messages:
```python
try:
    embed_text()
except Exception as e:
    print(f"ERROR: Failed to embed text: {str(e)}", file=sys.stderr)
    exit(1)
```

## Troubleshooting

### Jobs Stuck in "processing"

**Cause:** Worker crashed without updating status

**Fix:**
```sql
-- Reset stuck jobs (older than 10 minutes)
UPDATE ingestion_jobs
SET status = 'failed', error = 'Worker timeout'
WHERE status = 'processing'
  AND started_at < NOW() - INTERVAL '10 minutes';
```

### High Memory Usage

**Cause:** Large stdout/stderr accumulation

**Fix:** Already implemented (1MB buffer limit)

### Redis Connection Errors

**Check:**
```bash
redis-cli -u $RAG_REDIS_URL ping
# Should return: PONG
```

### Worker Not Starting

**Check:**
```bash
python --version
python ./python/ingest_worker.py --help
```

## Performance Tuning

### Concurrency

Increase for higher throughput:
```typescript
concurrency: 4,  // Process 4 jobs concurrently
```

Trade-off: Higher CPU/memory usage

### Lock Duration

Adjust for job complexity:
```typescript
lockDuration: 600_000,  // 10 minutes for slow jobs
```

### Retention

Reduce storage:
```typescript
removeOnComplete: { age: 1800 },   // 30 minutes
removeOnFail: { age: 7200 },       // 2 hours
```

## Migration Guide

### From Inline Processing

**Before:**
```typescript
// POST /api/ingest
await processIngestion(data);
```

**After:**
```typescript
// POST /api/ingest
await queueIngestionJob(data);
// Returns immediately, processing happens async
```

### Adding to Existing App

1. Import shutdown handler in `app/layout.tsx`:
```typescript
import '@/lib/queues/shutdown-handler';
```

2. Health check in monitoring:
```typescript
// Monitor /api/health/queue
```

3. Update deployment:
```bash
# Ensure Redis is accessible
# Update environment variables
# Deploy with graceful shutdown support
```

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/docs/)
- [Prometheus Metrics](https://prometheus.io/docs/concepts/metric_types/)
- [Langfuse Tracing](https://langfuse.com/docs)

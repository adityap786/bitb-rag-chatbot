# RAG Pipeline API Reference

## Overview
The RAG pipeline handles document ingestion, chunking, embedding, and storage. It provides real-time feedback via SSE and readiness checks for the playground.

## Endpoints

### 1. Trigger Ingestion
**POST** `/api/tenants/:tenantId/ingest`

Triggers a new ingestion run for the tenant.

**Headers:**
- `Authorization`: Bearer <token>

**Response:**
```json
{
  "jobId": "uuid",
  "status": "queued"
}
```

### 2. Ingestion Events (SSE)
**GET** `/api/tenants/:tenantId/ingest/:runId/events`

Streams real-time progress events.

**Events:**
- `step.started`: `{ type: "step.started", step: "chunking", ts: "...", message: "..." }`
- `step.completed`: `{ type: "step.completed", step: "chunking", ts: "...", message: "..." }`
- `step.failed`: `{ type: "step.failed", step: "chunking", ts: "...", message: "..." }`

### 3. Job Status (Polling)
**GET** `/api/tenants/:tenantId/ingest/:runId/status`

Returns the current status of the job.

**Response:**
```json
{
  "jobId": "uuid",
  "status": "processing",
  "progress": 45,
  "steps": {
    "ingestion": { "status": "completed", "duration": 1200 },
    "chunking": { "status": "running" }
  }
}
```

### 4. Pipeline Readiness
**GET** `/api/tenants/:tenantId/pipeline-ready`

Checks if the tenant's pipeline is ready for queries.

**Response:**
```json
{
  "ready": true,
  "ragStatus": "active",
  "lastIngestion": {
    "jobId": "uuid",
    "completedAt": "timestamp"
  }
}
```

### 5. Playground Readiness
**GET** `/api/playground/ready?tenant=:tenantId`

Simple check for playground UI initialization.

**Response:**
```json
{
  "ready": true
}
```

## Database Schema

### `ingestion_jobs`
Tracks the overall status of an ingestion run.
- `job_id`: UUID
- `status`: queued, processing, completed, failed
- `progress`: 0-100
- `pages_processed`, `chunks_created`, `embeddings_count`: Metrics

### `ingestion_job_steps`
Tracks individual steps (ingestion, chunking, embedding, storing).
- `step_key`: string
- `status`: pending, running, completed, failed
- `eta_ms`: Estimated time remaining

## Telemetry
Metrics are logged to stdout as structured JSON:
- `rag.chunking.duration`
- `rag.embedding.duration`
- `rag.storing.duration`
- `rag.chunks.created`

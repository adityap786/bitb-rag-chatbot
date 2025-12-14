# API Contracts (Onboarding → RAG)

This document captures the current (implemented) contracts for the onboarding flow.

## Auth
- **JWT Bearer:** Most onboarding endpoints use `Authorization: Bearer <jwt>` where `<jwt>` was returned as `setupToken` from `POST /api/trial/start`.

## POST /api/trial/start
Creates a trial tenant and returns a setup JWT.

Request JSON:
- `email: string`
- `businessName: string`
- `businessType: 'service' | 'ecommerce' | 'saas' | 'other'`

Response (201):
- `tenantId: string`
- `setupToken: string`
- `trialExpiresAt: string` (ISO)

Errors:
- 400 validation
- 409 if active trial exists
- 429 rate limited

## POST /api/trial/kb/manual
Creates a manual KB document for the authenticated tenant and may start ingestion.

Headers:
- `Authorization: Bearer <setupToken>`

Request JSON:
- `companyInfo: string`
- `knowledgeBaseSources?: string[]`
- `faqs?: { question: string; answer: string }[]`

Response (201):
- `kbId: string`
- `status: 'queued' | 'completed'`
- `message: string`
- `pipelineJobId?: string | null`
- `pipelineStatus?: string | null`

Errors:
- 401/403 auth
- 400 validation
- 404 tenant missing

## POST /api/tenants/:tenantId/ingest
Starts (or reuses) an ingestion job for the tenant.

Headers:
- `Authorization: Bearer <setupToken>`

Request JSON (optional):
- `source?: string` (default `manual`)
- `metadata?: object`
- `chunkSize?: number`
- `chunkOverlap?: number`
- `embeddingModel?: string`

Response (200):
- `runId: string`
- `status: 'processing'`
- `source: string`
- `startedAt: string`

Response (409):
- `status: 'processing'`
- `runId: string`
- `startedAt: string | null`
- `source: string`

## GET /api/tenants/:tenantId/ingest/:runId/events (SSE)
Streams ingestion step events.

Headers:
- `Authorization: Bearer <setupToken>`

Event data (JSON):
- `type: 'step.started' | 'step.completed' | 'step.failed' | 'pipeline.completed' | 'pipeline.cancelled'`
- `step: string` (Ingestion step key)
- `ts: string` (ISO)
- Optional: `etaMs`, `message`, `processed`, `total`, `runId`, `tenantId`

## GET /api/tenants/:tenantId/pipeline-ready
Checks readiness for `/api/ask`.

Headers:
- `Authorization: Bearer <setupToken>`

Response (200):
- `ready: boolean`
- `ragStatus: string`
- `vectorCount: number`
- `minVectors: number`
- `lastIngestion: { jobId: string; status: string; completedAt: string; embeddingsCount: number | null } | null`

## POST /api/trial/branding
Persists widget branding config and returns pipeline status info.

Headers:
- `Authorization: Bearer <setupToken>`

Request JSON:
- `primaryColor: string` (hex)
- `secondaryColor: string` (hex)
- `tone: 'professional' | 'friendly' | 'casual'`
- `welcomeMessage?: string`
- Optional UX metadata: `platform`, `framework`, `hosting`, `logoUrl`, `knowledgeBaseSources`

Response (200):
- `success: true`
- `config: { primaryColor; secondaryColor; tone; welcomeMessage; logoUrl; platform; framework; hosting; knowledgeBaseSources; assignedTools }`
- `pipeline: { status: 'pending' | 'processing' | 'ready' | 'failed'; jobId: string | null; startedAt: string | null }`

## POST /api/trial/generate-widget
Returns widget embed code once the pipeline is ready; otherwise returns an accepted/processing response.

Headers:
- `Authorization: Bearer <setupToken>`

Response (200):
- `embedCode: string`
- `widgetUrl: string`
- `previewUrl: string`
- `assignedTools: string[]`

Response (202):
- `status: 'processing'`
- `tenantId: string`
- `jobId: string | null`

## POST /api/ask
RAG query endpoint. Requires readiness.

Request JSON:
- `tenant_id: string`
- `trial_token?: string` (legacy)
- `query: string`

Response (200):
- `answer: string`
- `sources?: any[]`
- Optional: `confidence`, `llmProvider`, `llmModel`, `correlationId`

Errors:
- 425 while pipeline is not ready (structured response)
- 4xx on validation/auth

## Legacy endpoints
- `POST /api/start-trial` and `POST /api/ingest` appear to use a legacy `trials` table + `trial_token` auth pattern.
- Treat as deprecated unless confirmed as still in use.

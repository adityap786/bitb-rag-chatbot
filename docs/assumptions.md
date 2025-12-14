# Assumptions & Open Questions (Onboarding → RAG)

This document records ambiguous or drifting contracts discovered during the onboarding → ingestion → RAG → widget flow.

## Tenant lifecycle vs RAG pipeline state
- **Assumption:** `public.tenants.status` represents **tenant lifecycle** (e.g. `pending`, `provisioning`, `active`, `expired`, `suspended`, ...), as defined in the production schema migrations.
- **Assumption:** RAG pipeline state is derived from **`ingestion_jobs` + `embeddings`** and should not be persisted into `tenants.status`.
- **Open question:** Do we want a dedicated `tenants.rag_status` column or keep it fully derived?

## Auth tokens
- **Assumption:** Onboarding UI uses a JWT **setup token** returned from `POST /api/trial/start` and sends it as `Authorization: Bearer <jwt>`.
- **Assumption:** Legacy `tr_...` trial tokens exist in older endpoints (e.g. `/api/start-trial`) but are not acceptable as Bearer tokens for JWT-protected endpoints.
- **Open question:** Which endpoints are considered canonical going forward: `/api/trial/*` (JWT) or `/api/start-trial` + `/api/ingest` (trial_token)?

## Ingestion job identity
- **Assumption:** `ingestion_jobs.job_id` is a UUID (per modern schema) and is used as the `runId` / `jobId` in UI and SSE routes.
- **Open question:** There are legacy code paths that generate `job_...` string IDs. If those endpoints are still used, they need a compatibility layer or deprecation.

## Pipeline readiness
- **Assumption:** "Ready" means **vector count** is at least `MIN_PIPELINE_VECTORS` and latest job is `completed`.
- **Assumption:** `/api/ask` should return a structured non-500 response (e.g. 425) while not ready.
- **Open question:** How should we handle tenants with very small KBs that will never reach `MIN_PIPELINE_VECTORS`? (Env default vs dynamic min)

## Streaming progress (SSE)
- **Assumption:** SSE events are derived from `ingestion_job_steps` rows and job state from `ingestion_jobs`.
- **Assumption:** Clients should tolerate disconnects and fall back to polling.
- **Open question:** Should we unify `/api/trial/ingestion-steps/stream` and `/api/tenants/:tenantId/ingest/:runId/events` into one canonical streaming endpoint?

## Build-time side effects
- **Assumption:** `next build` should not require Redis or attempt to connect to local services.
- **Open question:** Some queue/worker modules appear to connect at import-time, which can surface during build or route analysis.

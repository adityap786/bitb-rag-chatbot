# Project Context — BitB RAG Chatbot

Date: 2025-12-13

## Overview

This repository contains the BitB Retrieval-Augmented-Generation (RAG) Chatbot system used to ingest tenant data, generate embeddings, store vectors, and serve a multi-tenant conversational experience backed by retrieval + LLM responses.

The codebase combines a Next.js-based frontend/API surface with background ingestion workers, embedding generation tooling, and integrations with Supabase (Postgres + storage), Redis (Upstash), and an embedding service. The system is multi-tenant and includes trial/onboarding flows, quota enforcement, and admin tooling.

## High-level architecture

- **Frontend / API**: Next.js application (App Router) under `src/app` that exposes UI pages and server functions / API routes under `src/app/api` for ingestion, widget queries, health checks, admin endpoints, and trial flows.
- **Background workers & queues**: Node-based worker processes and queue adapters in `src/lib` (examples: `ingestion-worker`, `ingestQueue`, `tenantPipelineQueue`) that handle ingestion, embedding generation, and async pipeline orchestration.
- **Embedding & Vector Store**: Embeddings are produced either by a local embedding service (see `services/bge_embedding_service` and `scripts/start-embedding-service.ps1`) or the configured cloud model provider. Vector storage and retrieval is implemented via Supabase/Postgres retriever (`src/lib/rag/supabase-retriever-v2.ts`).
- **Cache / Fast lookup**: Redis client implementation using Upstash (`src/lib/redis-client-upstash.ts`) for rate-limiting, ephemeral caches, and short-lived state.
- **Model orchestration**: Internal model registry & router (`src/lib/mcp/registry.ts`, `src/lib/mcp/router.ts`) used to configure and call LLM or embedding providers.
- **Admin & multi-tenant controls**: Tenant middleware, JWT handling, quota enforcement and admin endpoints located in `src/lib` and `src/app/api/admin`.

## Main components (code areas)

- **UI & App Router**: `src/app` — marketing pages, trial flows, widget UI and server actions.
- **Components**: `src/components` — UI components, trial wizards, admin panels, and chat widget components.
- **Ingestion / Pipeline**: `src/app/api/tenants/[tenantId]/ingest`, `src/lib/trial/*`, `src/lib/ingestion-worker.ts`, `src/lib/queues/*`.
- **Embeddings**: `src/lib/embeddings/*`, `migrate_embeddings_768.py`, `backfill_embeddings.py`, and `services/bge_embedding_service` (local embedding service helper).
- **Retrieval / RAG**: `src/lib/rag/supabase-retriever-v2.ts`, `src/lib/trial/rag-pipeline.ts`, `src/lib/trial/start-pipeline.ts`.
- **Security & access**: `src/lib/jwt.ts`, `src/lib/middleware/tenant-context.ts`, `src/lib/security/tenant-access-validator.ts`.

## Key external services & infra

- **Supabase / Postgres**: Primary persistent storage for tenant metadata, documents, and vector indices (via Supabase vector or Postgres extension).
- **Upstash (Redis)**: Fast key-value store used for caching, rate-limiting, and short-lived pipeline state.
- **Embedding service(s)**:
  - Local development: a local Python embedding service in `services/bge_embedding_service` (scripts provided under `scripts/`).
  - Cloud provider (planned migration): target provider "Google Antigravity" (replace provider-specific client in the model registry and embedding config).
- **LLM provider(s)**: Managed through the `mcp` registry/router — allows plugging different model providers (existing config and new Google Antigravity provider should be wired here).
- **Storage / object store**: Supabase Storage (or cloud storage used alongside Supabase) for large files and ingestion sources.
- **CI / Tests**: `vitest` used for unit tests (`vitest.config.ts`), plus scripts for health checks and dev tasks.

## Data flow (ingest → serve)

1. Ingestion: Tenant submits data (via UI or API) to `src/app/api/tenants/[tenantId]/ingest/route.ts`.
2. Preprocessing: Worker normalizes, shards, and stores raw documents in Postgres/Supabase.
3. Embedding generation: Documents are sent to the embedding service (local or cloud) via `src/lib/embeddings/*`.
4. Vector storage: Embeddings are persisted into Supabase/Postgres vector index.
5. Retrieval: `supabase-retriever-v2` retrieves top-k vectors for RAG queries.
6. LLM call: The system routes the retrieval + prompt to the selected LLM provider via the `mcp` router.
7. Response: LLM output is returned through widget APIs and UI components.

## Multi-tenant & security notes

- Tenant isolation is enforced via tenant middleware and per-tenant pipelines. Quotas and trial behavior are enforced in `src/lib/trial/quota-enforcer.ts`.
- Auth uses JWTs (`src/lib/jwt.ts`) with admin-only routes in `src/app/api/admin/*`.
- Ensure secrets and provider keys are stored securely (environment variables, secret manager) and not committed to repo.

## Local dev & important scripts

- Use `npm run dev` to start the Next.js dev server (app router). See `package.json` for exact scripts.
- Start the local embedding service (PowerShell): `scripts/start-embedding-service.ps1`.
- Useful maintenance scripts: `scripts/doctor-env.mjs`, `scripts/start-next-dev.ps1`, `migrate_embeddings_768.py`, `backfill_embeddings.py`.
- Tests: `npx vitest run` to execute unit tests.

## Migration considerations — Google Antigravity

- **Model & embedding adapter**: Implement a provider adapter in the `mcp` registry and update `src/lib/embeddings/config.ts` to support Google Antigravity endpoints and authentication.
- **Embedding compatibility**: Verify embedding dimensionality and tokenization differences; run a backfill if dimensions or semantics change (use `migrate_embeddings_768.py` / `backfill_embeddings.py`).
- **Retrieval tuning**: After migration, re-evaluate k, similarity metric, and hybrid retrieval thresholds.
- **Cost & rate limits**: Add throttling and queuing (already present) to handle provider rate limits.
- **Testing**: Add integration tests that exercise the full RAG path: ingest → embed → store → retrieve → LLM.

## Recommendations / next steps

- Add this document to `docs/` (done) and link from the main `README.md`.
- Create an integration branch for the Google Antigravity adapter and run a staging backfill on non-production data.
- Add CI checks to run critical integration tests (ingest → embed → retrieve).

## Owners / Contacts

- Primary repo owner: GitHub repo `adityap786/bitb-rag-chatbot` (see repository settings).
- Code areas:
  - Ingestion & pipeline: `src/lib/trial`, `src/lib/ingestion-worker.ts`
  - Embeddings & migration: `src/lib/embeddings`, `migrate_embeddings_768.py`
  - Model registry / orchestration: `src/lib/mcp`

---

Revision: 2025-12-13 — created by automation.

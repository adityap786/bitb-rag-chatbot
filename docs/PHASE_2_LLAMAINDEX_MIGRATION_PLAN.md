# Phase 2 — LlamaIndex Migration: Plan, Structure & Progress

This file documents the Phase‑2 migration plan, the tasks (TODOs), their structure, and the current progress. It is intended as a single source-of-truth for engineers and reviewers.

Location of work
- Python microservice scaffold: `services/llamaindex_service/`
- Node adapter: `src/lib/llamaindex-adapter.ts`
- YAML config plan: `config/` (to be created)

Overview
- Goal: migrate ingestion, chunking, embeddings, vector stores, and retrieval to LlamaIndex-driven infrastructure while keeping LangChain as orchestration for multi-step workflows and conversation management.
- Principles:
  - Tenant isolation (per-tenant indices and strict isolation for queries).
  - YAML-first configuration for tenant configs, prompts, feature flags, and infra.
  - Minimal breaking changes: Node app calls the Python service through a typed adapter.

Roadmap (high level)
1. Architecture decision & vector-store selection — DONE (recommend Python microservice + pluggable vector store)
2. Prototype Python LlamaIndex microservice scaffold — DONE (FastAPI scaffold created)
3. Ingestion & chunking pipelines — IN PROGRESS (this file documents current work)
4. Embeddings pipeline & provider abstraction — planned
5. Per-tenant vector store management — planned
6. Delta updates & sync jobs — planned
7. Retrieval: top-k, hybrid search, fallback — planned
8. Query decomposition & reranking — planned
9. Node LangChain orchestrator & adapters — scaffolded (adapter present)
10. Tests, benchmarks, CI/CD — planned
11. Docs & runbook for Phase 2 — planned

Current progress (detailed)
- Service scaffold (FastAPI + Supabase & OpenAI adapters): created at `services/llamaindex_service/`.
- Node adapter: `src/lib/llamaindex-adapter.ts` created.
- YAML-first strategy: TODOs added and config plan created in project TODO list (files to be created under `config/`).

This document's purpose
- Keep a human-friendly checklist for Phase‑2 activities.
- Record decisions and pointers to code files.
- Provide an action plan for the immediate next steps.

Immediate next steps (this work)
1. Implement robust TextSplitter / chunking in the Python service.
   - Configurable chunk size and overlap. Default: chunk_size=1000, overlap=200.
   - Track parent document id, chunk index, offsets in metadata.
   - Use batch-embedding path to add chunks to per-tenant vector store.
2. Wire chunking into `/ingest` endpoint as default behavior (with an opt-out flag).
3. Add basic tests / example ingestion flow (local sample document) and sample `curl` instructions.

Conventions
- Per-tenant collections: `tenant_<tenant_id>` (applies to Supabase) — stores chunk entries with metadata `parent_doc_id`, `chunk_index`, `offset`.
- Doc chunk id format: `<doc_id>::chunk::<index>`
- YAML-first: any new prompt, feature flag, or tenant config must be proposed in `config/` first.

How to verify locally
- Start Python service:

```powershell
cd services/llamaindex_service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Ingest a sample document (example curl):

```powershell
curl -X POST "http://localhost:8000/ingest" -H "Content-Type: application/json" -d @- << 'JSON'
{"tenant_id":"tn_example","doc_id":"doc1","content":"Long document text...","metadata":{"title":"Example"}}
JSON
```

- Search the index:

```powershell
curl -X POST "http://localhost:8000/search" -H "Content-Type: application/json" -d '{"tenant_id":"tn_example","query":"what is this document about?","k":5}'
```

## Example: Test & cURL flows

### Run chunking and ingestion tests (pytest)

```powershell
cd services/llamaindex_service
pytest tests/test_chunking.py
pytest tests/test_ingest_flow.py
```

### Ingest a sample document (cURL)

```bash
curl -X POST "http://localhost:8000/ingest" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"tn_example","doc_id":"doc1","content":"abcdefghijklmnopqrstuvwxyz0123456789","metadata":{"title":"Example"}}'
```

### Ingest with chunking disabled (cURL)

```bash
curl -X POST "http://localhost:8000/ingest?chunk=false" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"tn_example","doc_id":"doc1","content":"abcdefghijklmnopqrstuvwxyz0123456789","metadata":{"title":"Example"}}'
```

### Search the index (cURL)

```bash
curl -X POST "http://localhost:8000/search" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"tn_example","query":"what is this document about?","k":5}'
```

Notes & Risks
- Current scaffold uses Chroma + OpenAI embeddings. For production scale, use BAAI/bge-large-en-v1.5 for embeddings and prefer a durable vector store such as `pgvector` (Supabase), Milvus, or Weaviate.
- Embedding costs: use provider abstraction & caching to minimize repeated embeddings.

Owner & contact
- Owner: Platform engineering (update file when tasks change).
- This file must be updated after every major PR that affects Phase‑2.

---

Revision log
- 2025-11-22: Created scaffold and began chunking integration (ingest endpoint will be updated).


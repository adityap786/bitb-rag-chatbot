# LlamaIndex Microservice (Scaffold)

This directory contains a scaffold for a Python microservice that provides document ingestion, per-tenant vector stores, and search powered by LlamaIndex (a.k.a. `llama-index`). The implementation is intentionally minimal and contains clear extension points:

- FastAPI service exposing HTTP endpoints for `ingest`, `ingest/batch`, `index/create`, `index/update`, `index/delete`, `search`, and `embeddings/batch`.
- A pluggable vector-store abstraction (default: Chroma via `chromadb`) and an embedding provider wrapper (local `sentence-transformers` by default, with optional OpenAI fallback).

Key decisions and defaults
- **Embedding model (default):** `intfloat/e5-large-v2`. This model provides strong semantic embeddings and is recommended for GPU-backed production deployments.
- **CPU fallback:** use `sentence-transformers/all-mpnet-base-v2` for CPU-only environments or when GPU/large-model hosting isn't available.
- **Caching:** optional Redis-based embedding cache (`EMBEDDING_CACHE_REDIS_URL`) with an in-process LRU fallback when Redis isn't configured.

Important environment variables
- `EMBEDDING_PROVIDER` - `local` (HF `sentence-transformers`) or `openai` (default: `local`).
- `EMBEDDING_MODEL` - model to use for the local provider (default: `intfloat/e5-large-v2`).
- `EMBEDDING_BATCH_SIZE` - batching size for local embedding calls (default: `64`).
- `EMBEDDING_CACHE_REDIS_URL` - optional Redis URL for caching embeddings (e.g. `redis://localhost:6379/0`).
- `EMBEDDING_CACHE_TTL` - cache TTL in seconds (default: `86400`).
- `EMBEDDING_LRU_MAX` - max size for in-process LRU cache (default: `10000`).
- `OPENAI_API_KEY` - required only if `EMBEDDING_PROVIDER=openai` or as a fallback when local provider isn't available.
- `INDEX_BACKEND` - backend to use for vector storage (default: `chroma`).

Quickstart (local)

1. Create a virtualenv and install dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Run the service locally

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Docker (example)

```powershell
docker build -t llamaindex-service:dev .
docker run -e OPENAI_API_KEY=sk-... -p 8000:8000 llamaindex-service:dev
```

Model guidance & production notes
- `intfloat/e5-large-v2` gives higher-quality embeddings but is larger and benefits significantly from GPU inference (or optimized/provisioned inference endpoints). For CPU-only deployments choose `sentence-transformers/all-mpnet-base-v2` or consider quantized ONNX / GGUF variants of E5 that are CPU-friendly.
- If you plan to serve embeddings at scale, prefer a GPU-backed inference endpoint or managed embedding service (Hugging Face Inference Endpoints, Replicate, etc.).
- Tune `EMBEDDING_BATCH_SIZE` based on memory and throughput; larger batch sizes often increase GPU throughput.
- Use `EMBEDDING_CACHE_REDIS_URL` to reduce duplicate compute and lower inference costs; set a sensible TTL (e.g. 30 days) for production.

Testing
- Unit tests live under `services/llamaindex_service/tests/`.
- The repository includes fast unit tests that mock heavy dependencies (e.g. `sentence-transformers`) so CI remains fast.
- Example: run a single test

```powershell
cd services/llamaindex_service
python -m pytest -q tests/test_embeddings.py::test_get_batch_embeddings_caches_and_deduplicates
```

Integration test for `/embeddings/batch`
- A lightweight integration test (`tests/test_integration_embeddings.py`) exercises the `POST /embeddings/batch` endpoint using `TestClient` and a fake Redis client. It mocks local embedding calls to keep the test fast and deterministic.

Next steps
- Swap the scaffold vector store to a production-grade persistent backend (pgvector, Weaviate, Milvus, or a managed service) for tenant isolation and scale.
- Add background workers for large-scale ingestion and sync jobs (Celery, Prefect, or similar).
- Consider a YAML-first configuration layer for tenant prompts and retrieval settings (see repository TODOs).

See source under `app/` for implementation details.

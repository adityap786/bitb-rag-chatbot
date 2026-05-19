# RAG Embedding Model Selection & Storage

## Overview
Each tenant can select their embedding model (e.g., BGE, Google Antigravity) via config. Embeddings are stored in the `embeddings` table with strict tenant_id partitioning and pgvector for similarity search.

## Steps
1. Fetch tenant config for embedding model selection
2. Store embeddings with tenant_id and chunk_id
3. Query embeddings using pgvector similarity search, filtered by tenant_id

## Key Decisions
- Embedding model is configurable per tenant for flexibility
- All embeddings are strictly partitioned by tenant_id
- pgvector is used for fast, open source vector search

---

This enables scalable, secure, and flexible embedding storage and retrieval for all tenants.

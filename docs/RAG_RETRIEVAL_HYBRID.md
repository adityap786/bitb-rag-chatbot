# RAG Retrieval & Hybrid Search

## Overview
Documents are retrieved per tenant using vector similarity search (pgvector). All queries are filtered by tenant_id for strict isolation. Hybrid search (BM25 + vector) can be added per tenant config.

## Steps
1. Query embeddings for tenant using match_embeddings
2. Fetch chunk texts for matched chunk_ids
3. (Optional) Combine with BM25 or keyword search for hybrid retrieval

## Key Decisions
- All retrieval is strictly filtered by tenant_id
- Hybrid search is configurable per tenant
- All infra is open source or free

---

This enables fast, accurate, and secure retrieval for all tenants.

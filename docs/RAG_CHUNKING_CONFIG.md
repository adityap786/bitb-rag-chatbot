# RAG Pipeline Chunking & Configurability

## Overview
Documents are chunked per tenant with configurable chunk size and overlap. Chunks are stored in the `document_chunks` table, tagged by tenant and document.

## Steps
1. Fetch document by tenant_id and document_id
2. Chunk content with configurable size/overlap
3. Store chunks with tenant_id and document_id

## Key Decisions
- Chunking is parameterized per tenant for flexibility
- All chunks are strictly isolated by tenant_id
- All infra is open source or free

---

This enables fast, flexible, and secure chunking for all tenants.

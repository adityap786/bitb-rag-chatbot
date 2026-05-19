# RAG Pipeline Ingestion & Data Isolation

## Overview
All documents ingested are tagged with tenant_id and stored in the `documents` table. This ensures strict data isolation and enables per-tenant chunking, embedding, and retrieval.

## Steps
1. Store document with tenant_id and metadata
2. Trigger chunking and embedding jobs (to be implemented)
3. All queries and jobs are filtered by tenant_id

## Key Decisions
- All ingestion is API-driven and auditable
- Data isolation is enforced at the DB and application level
- All infra is open source or free

---

This ensures secure, scalable, and auditable ingestion for all tenants.

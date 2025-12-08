-- Migration: 20251127000001_add_embedding_384.sql
-- Purpose: Add a nullable 384-dim vector column for a safe dual-write/backfill rollout.
-- Notes:
--  - This migration adds `embedding_384 vector(384)` (nullable) to `embeddings` and
--    `document_chunks`, and also adds `embedding_model TEXT` and `embedding_dim INT` to
--    both tables so we can track which model and dims were used.
--  - We intentionally DO NOT alter or drop the existing `embedding` column.
--  - Adding nullable columns without defaults is non-blocking in Postgres (fast).
--  - If you are concerned about any long-running locks in your environment, run
--    during a low-traffic window and test on staging first.

BEGIN;

-- Ensure pgvector is available (harmless if already present)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add nullable 384-dim vector column to embeddings
ALTER TABLE IF EXISTS public.embeddings
  ADD COLUMN IF NOT EXISTS embedding_384 vector(384);

-- Add nullable 384-dim vector column to document_chunks
ALTER TABLE IF EXISTS public.document_chunks
  ADD COLUMN IF NOT EXISTS embedding_384 vector(384);

-- Add metadata columns to track which model and dimension produced the vector
ALTER TABLE IF EXISTS public.embeddings
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dim INT;

ALTER TABLE IF EXISTS public.document_chunks
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dim INT;

-- Create a small table to record resumable backfill job progress (idempotent)
CREATE TABLE IF NOT EXISTS public.embedding_backfill_jobs (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  last_processed_ts TIMESTAMP WITH TIME ZONE,
  last_processed_id BIGINT,
  processed_count BIGINT DEFAULT 0,
  batch_size INT DEFAULT 64,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embedding_backfill_jobs_table_name ON public.embedding_backfill_jobs(table_name);

COMMIT;

-- Example index creation (do NOT run in this migration):
-- After backfill completes and you've validated results, create an ANN index on the new
-- `embedding_384` column using `CREATE INDEX CONCURRENTLY` with `ivfflat` or `hnsw` depending
-- on pgvector/pg_similarity extensions available in your Postgres distribution.
-- Example (run separately during low traffic):
--   CREATE INDEX CONCURRENTLY ON public.embeddings USING ivfflat (embedding_384 vector_cosine_ops) WITH (lists = 100);
-- Or for pgvector + hnsw (if available):
--   CREATE INDEX CONCURRENTLY ON public.embeddings USING hnsw (embedding_384 vector_cosine_ops);

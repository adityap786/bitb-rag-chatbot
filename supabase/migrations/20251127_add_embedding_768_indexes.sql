-- Index creation for 768-dim embeddings
-- IMPORTANT: Run this script OUTSIDE of a transaction (psql or Supabase SQL editor)
-- because it uses `CREATE INDEX CONCURRENTLY` which cannot run inside a transaction block.
--
-- Usage (psql):
--   psql -h <host> -d <db> -U <user> -f 20251127_add_embedding_768_indexes.sql
--
-- This file intentionally does not `BEGIN`/`COMMIT` so it can be executed concurrently.

-- NOTES:
-- * If your Postgres version supports `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (PG15+),
--   the `IF NOT EXISTS` variant is used below for safety.
-- * On older Postgres versions, run the SELECT check and then create the index manually
--   or run non-concurrent index creation in a maintenance window.

-- Create HNSW index for embeddings table (low-lock, concurrent build)
-- Postgres 15+ (preferred):
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_768
  ON public.embeddings USING hnsw (embedding_768 vector_cosine_ops);

-- For `vector_documents` we prefer IVFFLAT for larger datasets;
-- tune `lists` according to your dataset size and memory constraints.
CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_documents_embedding_idx_768
  ON public.vector_documents USING ivfflat (embedding_768) WITH (lists = 100);

-- Fallback guidance for older Postgres (if CONCURRENTLY/IF NOT EXISTS not supported):
-- 1) Check if indexes exist:
--    SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_embeddings_vector_768','vector_documents_embedding_idx_768');
-- 2) If indexes are missing and you cannot run CONCURRENTLY, consider creating them during a
--    maintenance window with a non-concurrent CREATE INDEX, or use an index-swap approach:
--      - Create a new table with the same schema and populated data (in batches),
--      - Build index on the new table, then swap tables (rename) during a short maintenance window.

-- End of indexes script

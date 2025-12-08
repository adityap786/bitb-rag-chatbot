
-- Migration: (REMOVED 384-dim embedding columns, now using only 768-dim embeddings)


BEGIN;

-- No 384-dim columns. All embeddings use 768-dim columns. If you need to track backfill jobs, use a separate migration.

COMMIT;

COMMIT;

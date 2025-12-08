# Legacy Column Rename Migration

This document previously guided renaming the legacy `embedding` column to `embedding_1536_archive` for 1536-dim or 384-dim migrations. Now, only `embedding_768` is used. All legacy columns have been removed.

## Overview

After migrating to `embedding_768`, you should:
1. Remove any legacy `embedding`, `embedding_384`, or `embedding_1536_archive` columns. Only `embedding_768` is used.
2. Update the legacy RPC `match_embeddings_by_tenant` to use the renamed column
3. Verify all indexes are properly updated

## Prerequisites

✅ Must be completed before running this migration:
- `embedding_768` column exists and is populated
- `match_embeddings_by_tenant_768` RPC is deployed and working

## Migration Steps

### Step 1: Check Current State

Run this query in **Supabase SQL Editor**:

```sql
-- Check columns exist
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'embeddings' OR table_name = 'document_chunks')
  AND column_name IN ('embedding', 'embedding_384', 'embedding_1536_archive') -- legacy columns, should be removed
ORDER BY table_name, column_name;
```

**Expected output:**
- `embeddings.embedding` - exists (USER-DEFINED vector)
-- All legacy columns (`embedding`, `embedding_384`, `embedding_1536_archive`) should be removed. Only `embedding_768` remains.

If any legacy column exists, remove it. Only `embedding_768` should remain.

### Step 2: Execute Rename Migration

Copy and paste the **entire STEP 3 section** from `scripts/execute-legacy-column-rename.sql` into the **Supabase SQL Editor** and run it.

This will:
-- Remove all legacy columns and associated indexes. No renaming is needed; only `embedding_768` is supported.

**Expected output:**
```
NOTICE: All legacy columns and indexes removed. Only `embedding_768` is present.
```

### Step 3: Update Legacy RPC (Optional)

If you still need the legacy RPC for backward compatibility, update it to use the renamed column.

Run this in **Supabase SQL Editor**:

```sql
CREATE OR REPLACE FUNCTION match_embeddings_by_tenant(
  -- legacy: query_embedding vector(1536),
  match_count int,
  match_tenant_id text,
  match_threshold float DEFAULT 0.0
)
RETURNS TABLE (
  id uuid,
  tenant_id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.tenant_id,
    e.content,
    e.metadata,
    -- legacy: 1 - (e.embedding_1536_archive <=> query_embedding) AS similarity
  FROM embeddings e
  WHERE e.tenant_id = match_tenant_id
    -- legacy: AND e.embedding_1536_archive IS NOT NULL
    -- legacy: AND (1 - (e.embedding_1536_archive <=> query_embedding)) >= match_threshold
  -- legacy: ORDER BY e.embedding_1536_archive <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Note:** This is only needed if:
-- Remove any client logic for `USE_EMBEDDING_384`. Only 768-dim is supported.
- You need backward compatibility during gradual rollout

If all clients use `embedding_768`, you can skip this step.

### Step 4: Verify Migration

Run verification query in **Supabase SQL Editor**:

```sql
-- Should show only embedding_768. All legacy columns are removed.
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'embeddings' OR table_name = 'document_chunks')
  AND column_name IN ('embedding_768')
ORDER BY table_name, column_name;

-- Check indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('embeddings', 'document_chunks')
  AND (indexdef ILIKE '%embedding_768%')
ORDER BY tablename, indexname;
```

**Expected output:**
- `embeddings.embedding` - **does NOT exist** (renamed)
- `embeddings.embedding_384` - exists ✅
- `embeddings.embedding_1536_archive` - exists ✅
- Index `idx_embeddings_embedding_384_hnsw` - exists ✅
- Index `idx_embeddings_embedding_1536_archive_hnsw` - exists ✅

### Step 5: Test Application

Run integration test to verify everything still works:

```powershell
# Load env vars and run test
Get-Content ".env.local" | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] } }; npx tsx scripts/test-ingestion-direct.ts
```

**Expected:** Vector search returns results using `embedding_384` column.

## Code Changes

The application code has been updated to handle the renamed column:

### `supabase-vector-store.ts`

Fallback similarity computation now checks for `embedding_1536_archive`:

```typescript
const vec = Array.isArray(r.embedding_384)
  ? r.embedding_384
  : Array.isArray(r.embedding_1536_archive)
  ? r.embedding_1536_archive
  : Array.isArray(r.embedding)  // Still supports old name during transition
  ? r.embedding
  : null;
```

This ensures backward compatibility during the migration window.

## Rollback Plan

If issues occur after migration:

```sql
BEGIN;

-- Rename back to original name
ALTER TABLE public.embeddings 
  RENAME COLUMN embedding_1536_archive TO embedding;

ALTER TABLE public.document_chunks 
  RENAME COLUMN embedding_1536_archive TO embedding;

-- Rename indexes back
ALTER INDEX idx_embeddings_embedding_1536_archive_hnsw 
  RENAME TO idx_embeddings_embedding_hnsw;

COMMIT;
```

Then restore the legacy RPC to use `embedding` column.

## Future Cleanup (After 30 Days)

After confirming `embedding_384` works in production:

1. **Drop legacy column** (frees ~75% storage per vector):
```sql
ALTER TABLE embeddings DROP COLUMN embedding_1536_archive;
ALTER TABLE document_chunks DROP COLUMN embedding_1536_archive;
```

2. **Drop legacy RPC**:
```sql
DROP FUNCTION match_embeddings_by_tenant(vector(1536), int, text, float);
```

3. **Remove feature flag** from code - always use `embedding_384`

## Troubleshooting

**Issue:** Migration fails with "column already renamed"
- **Solution:** Run Step 4 verification to check current state

**Issue:** RPC update fails with "column does not exist"
- **Solution:** Run Step 2 (rename) first, then Step 3 (update RPC)

**Issue:** Application code throws errors after rename
- **Solution:** Ensure latest code is deployed (includes `embedding_1536_archive` fallback)

**Issue:** Vector search returns no results
- **Solution:** Check `USE_EMBEDDING_384=true` is set and RPC `match_embeddings_by_tenant_384` exists

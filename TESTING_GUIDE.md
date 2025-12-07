# End-to-End Testing Guide: match_embeddings_by_tenant Function

This guide helps you test the HNSW-optimized retrieval function end-to-end, verifying that mpnet embeddings, tenant isolation, and the API integration work correctly.

## Overview

The testing covers three levels:

1. **Database Level**: Direct SQL testing of `match_embeddings_by_tenant` function
2. **TypeScript Level**: Direct function calls via Supabase client (test-retriever-e2e.ts)
3. **API Level**: Full end-to-end via HTTP (test-api-e2e.ps1 or test-api-e2e.sh)

---

## Prerequisites

Before testing, ensure:

1. **Supabase is running** with migrations applied:
   ```bash
   # Check migration status in Supabase dashboard or via CLI
   supabase migration list
   ```

2. **Environment variables are set** (.env.local):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   HUGGINGFACE_API_KEY=your-hf-token
   BITB_EMBEDDING_MODEL=sentence-transformers/all-mpnet-base-v2
   ```

3. **Sample data is ingested** for your test tenant:
   - At least one document with a non-NULL `embedding_768` column
   - Document must have a matching `tenant_id`

---

## Level 1: Database Testing (SQL Direct)

### Test via Supabase Dashboard

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **SQL Editor**
3. Create a new query:

```sql
-- Test: Call match_embeddings_by_tenant directly
-- Replace 'tn_...' with your actual test tenant ID

SELECT * FROM match_embeddings_by_tenant(
  -- Query embedding (768-dim vector of zeros for testing)
  '[' || array_to_string(array_fill(0.0, ARRAY[768]), ',') || ']'::vector,
  -- Tenant ID
  'tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  -- Match count
  5,
  -- Similarity threshold
  0.0
);
```

4. **Expected Output**:
   - Returns 5 rows (or fewer if fewer documents exist)
   - Each row has: `id`, `chunk_text`, `metadata`, `similarity` (0.0-1.0)
   - Rows ordered by similarity descending

5. **Troubleshooting**:
   - **Error: `operator does not exist`**: `search_path` in function not set correctly. Check migration 003.
   - **Error: `type ... does not exist`**: Vector type not visible. Ensure `extensions` is in search_path.
   - **No results**: Check if embeddings exist: `SELECT COUNT(*) FROM embeddings WHERE tenant_id = 'tn_...' AND embedding_768 IS NOT NULL;`

---

## Level 2: TypeScript Testing (Direct Function Call)

### Run the TypeScript test script

```bash
# From the workspace root
cd "W:\BIT B RAG CAHTBOT"

# Activate Python venv (if using Node from it)
. langcache.venv/Scripts/Activate.ps1

# Run the test
npx ts-node test-retriever-e2e.ts
```

### Expected Output

```
================================================================================
END-TO-END TEST: match_embeddings_by_tenant Function
================================================================================

Configuration:
  Supabase URL: https://...
  Embedding Model: sentence-transformers/all-mpnet-base-v2
  Test Tenant: tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

[1/4] Initializing Supabase client...
✓ Supabase client initialized

[2/4] Setting tenant context and checking embeddings table...
✓ Tenant context set. Found X embeddings for this tenant

[3/4] Generating test query embedding with mpnet...
✓ Generated embedding for query: "What is the return policy?"
  Embedding dimension: 768
  First 5 values: [-0.0234, 0.1203, -0.0456, 0.0789, -0.0123]

[4/4] Calling match_embeddings_by_tenant function...
✓ Function executed successfully

================================================================================
RESULTS
================================================================================
Found 5 matching documents:

[1] ID: 550e8400-e29b-41d4-a716-446655440000
    Similarity: 75.32%
    Text (first 100 chars): Our return policy allows 30 days for returns without questions...
    Metadata: {"source":"terms.md","page":1}

[2] ID: 550e8400-e29b-41d4-a716-446655440001
    Similarity: 68.14%
    Text (first 100 chars): Customers can request refunds up to 60 days...
    Metadata: {"source":"faq.md","page":2}

...

================================================================================
✓ TEST PASSED: Function is working correctly!
================================================================================
```

### Troubleshooting

- **Cannot find module "@langchain/community/embeddings/hf"**: Install dependencies: `npm install`
- **HUGGINGFACE_API_KEY not found**: Set in .env.local or export as environment variable
- **No results returned**: Check sample data exists for the tenant

---

## Level 3: API Testing (Full End-to-End)

### Prerequisites

1. **Start the Next.js dev server**:
   ```bash
   npm run dev
   # or
   npx next dev
   ```

2. **Verify it's running**:
   ```
   http://localhost:3000
   ```

### Run the API Test (Windows PowerShell)

```powershell
# Run with default settings (localhost:3000, test tenant)
powershell -ExecutionPolicy Bypass -File test-api-e2e.ps1

# Or with custom parameters
powershell -ExecutionPolicy Bypass -File test-api-e2e.ps1 `
  -ApiUrl "http://localhost:3000" `
  -TenantId "tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

### Run the API Test (Bash/Linux/Mac)

```bash
# Run with default settings
bash test-api-e2e.sh

# Or with custom parameters
API_URL="http://localhost:3000" \
TENANT_ID="tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
bash test-api-e2e.sh
```

### Expected Output

```
============================================================================
END-TO-END TEST: /api/ask Route
============================================================================

Configuration:
  API URL: http://localhost:3000
  Tenant ID: tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

[1/3] Testing basic query retrieval...
Response:
{
  "answer": "Our return policy allows 30 days for returns without questions asked...",
  "sources": [
    {
      "content": "Return Policy: ...",
      "metadata": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "source": "terms.md"
      }
    }
  ],
  "confidence": 0.8,
  "preview": false
}

✓ Test 1a PASSED: Received answer field
✓ Test 1b PASSED: Received 3 sources

[2/3] Testing query with retrieval metadata...
  Confidence score: 0.8
✓ Test 2 PASSED: Confidence is > 0

[3/3] Testing error handling (empty query)...
✓ Test 3 PASSED: Error handling works
  Error message: Query is required

============================================================================
✓ ALL TESTS PASSED
============================================================================

The retrieval function is working end-to-end!

Next steps:
1. Test with your real tenant IDs and sample data
2. Monitor query performance using the HNSW index
3. Verify tenant isolation by checking cross-tenant access is blocked
```

### Troubleshooting

- **Connection refused (localhost:3000)**: Dev server not running. Run `npm run dev`
- **Empty results**: No sample data for the tenant. Run the ingest endpoint first.
- **Timeout**: HNSW index building or embeddings API slow. Wait and retry.
- **Tenant isolation violated**: Cross-tenant data returned. Check RLS policies.

---

## Performance Validation

After passing all tests, validate performance:

### 1. Check HNSW Index Usage

```sql
-- Via Supabase SQL Editor
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM match_embeddings_by_tenant(
  '[' || array_to_string(array_fill(0.1, ARRAY[768]), ',') || ']'::vector,
  'tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  5,
  0.0
);
```

Expected: Query plan should show `Index Scan` on `embeddings_embedding_768_hnsw`

### 2. Measure Query Latency

```bash
# Run 10 sequential queries via API and measure time
time for i in {1..10}; do
  curl -s -X POST http://localhost:3000/api/ask \
    -H "Content-Type: application/json" \
    -d '{"tenant_id":"tn_...","query":"test query '$i'"}' > /dev/null
done
```

Expected: < 100ms per query after warm-up

### 3. Index Statistics

```sql
-- Check index size and efficiency
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'embeddings'
  AND indexname LIKE '%hnsw%';
```

---

## Security Validation

Verify tenant isolation is enforced:

### Test 1: Cross-Tenant Access Blocked

```bash
# Try to query embeddings from a different tenant
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "query": "attempt to access tenant A data"
  }'
```

Expected: Returns only results from tenant B, never from tenant A

### Test 2: Invalid Tenant Format Rejected

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "invalid_tenant",
    "query": "test"
  }'
```

Expected: 400 error with "Invalid tenant_id format"

---

## Debugging Checklist

If tests fail, check:

- [ ] Supabase migrations applied: `SELECT * FROM schema_migrations;`
- [ ] Vector extension installed: `SELECT * FROM pg_extension WHERE extname = 'vector';`
- [ ] Sample embeddings exist: `SELECT COUNT(*) FROM embeddings WHERE embedding_768 IS NOT NULL;`
- [ ] HNSW index exists: `SELECT * FROM pg_indexes WHERE tablename = 'embeddings' AND indexname LIKE '%hnsw%';`
- [ ] Function callable: `SELECT prosrc FROM pg_proc WHERE proname = 'match_embeddings_by_tenant';`
- [ ] RLS enabled: `SELECT * FROM pg_policies WHERE tablename = 'embeddings';`
- [ ] Environment variables set: `printenv | grep SUPABASE` or `$env:SUPABASE_URL` (PowerShell)

---

## Next Steps After Passing Tests

1. **Test with Real Data**: Replace test queries with production data
2. **Load Test**: Run concurrent requests to measure throughput
3. **Monitor**: Track query latency, index hit rate, and HNSW efficiency
4. **Tune HNSW**: Adjust `m` and `ef_construction` based on performance
5. **Re-embedding**: If data was pre-existing, re-embed with mpnet vectors for optimal index performance

---

## Support

For issues or questions:

1. Check [pgvector documentation](https://github.com/pgvector/pgvector)
2. Review [Supabase docs](https://supabase.com/docs)
3. Check function signature: `\df match_embeddings_by_tenant` in psql
4. Enable query logging: Set `log_statement = 'all'` in Postgres for debugging

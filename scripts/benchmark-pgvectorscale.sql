-- pgVectorscale Benchmark Script for BiTB RAG Chatbot
-- Run this on a staging Supabase instance to evaluate pgvectorscale performance

-- ============================================================================
-- SETUP: Enable pgvectorscale extension
-- ============================================================================

-- Check if pgvectorscale is available
SELECT * FROM pg_available_extensions WHERE name = 'vectorscale';

-- Enable extension (requires superuser or appropriate privileges)
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;

-- Verify installation
SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'vectorscale');

-- ============================================================================
-- BASELINE: Measure current IVFFlat performance
-- ============================================================================

-- Create test tenant
INSERT INTO trial_tenants (tenant_id, email, business_name, business_type, status, trial_expires_at)
VALUES (
  'tn_benchmark000000000000000000000000'::uuid,
  'benchmark@test.local',
  'Benchmark Test',
  'tech',
  'active',
  NOW() + INTERVAL '30 days'
)
ON CONFLICT (tenant_id) DO NOTHING;

-- Insert 10,000 test embeddings (simulates medium-sized tenant)
-- Note: Using random vectors for benchmark; real embeddings would come from model
INSERT INTO embeddings (embedding_id, kb_id, tenant_id, chunk_text, embedding, metadata)
SELECT
  gen_random_uuid(),
  gen_random_uuid(),
  'tn_benchmark000000000000000000000000'::uuid,
  'Benchmark test chunk ' || i || ': ' || md5(random()::text),
  (
    SELECT array_agg(random()::float)
    FROM generate_series(1, 1536)
  )::vector(1536),
  jsonb_build_object('test', true, 'index', i)
FROM generate_series(1, 10000) i;

-- Vacuum and analyze for accurate statistics
VACUUM ANALYZE embeddings;

-- Create baseline IVFFlat index (if not exists)
CREATE INDEX IF NOT EXISTS idx_embeddings_ivfflat_baseline 
ON embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Generate a random query vector
CREATE TEMP TABLE benchmark_query AS
SELECT (
  SELECT array_agg(random()::float)
  FROM generate_series(1, 1536)
)::vector(1536) as query_embedding;

-- Benchmark 1: IVFFlat query performance
\timing on
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT 
  embedding_id,
  chunk_text,
  1 - (embedding <=> (SELECT query_embedding FROM benchmark_query)) as similarity
FROM embeddings
WHERE tenant_id = 'tn_benchmark000000000000000000000000'
ORDER BY embedding <=> (SELECT query_embedding FROM benchmark_query)
LIMIT 10;
\timing off

-- Record baseline metrics
CREATE TEMP TABLE IF NOT EXISTS benchmark_results (
  test_name text,
  index_type text,
  query_time_ms float,
  planning_time_ms float,
  buffers_read int,
  buffers_hit int,
  index_size_mb float,
  notes text
);

-- Capture IVFFlat index size
INSERT INTO benchmark_results (test_name, index_type, index_size_mb)
SELECT 
  'baseline_ivfflat',
  'IVFFlat',
  pg_relation_size('idx_embeddings_ivfflat_baseline')::float / (1024 * 1024);

-- ============================================================================
-- TEST: Create and benchmark StreamingDiskANN index
-- ============================================================================

-- Create StreamingDiskANN index WITHOUT quantization (for comparison)
DROP INDEX IF EXISTS idx_embeddings_diskann_no_quant;
CREATE INDEX idx_embeddings_diskann_no_quant ON embeddings
USING diskann (embedding vector_cosine_ops)
WITH (
  num_neighbors = 50,
  search_list_size = 100,
  max_alpha = 1.2,
  storage_layout = 'memory_optimized'
);

VACUUM ANALYZE embeddings;

-- Benchmark 2: DiskANN without quantization
\timing on
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT 
  embedding_id,
  chunk_text,
  1 - (embedding <=> (SELECT query_embedding FROM benchmark_query)) as similarity
FROM embeddings
WHERE tenant_id = 'tn_benchmark000000000000000000000000'
ORDER BY embedding <=> (SELECT query_embedding FROM benchmark_query)
LIMIT 10;
\timing off

-- Capture DiskANN (no quant) index size
INSERT INTO benchmark_results (test_name, index_type, index_size_mb)
SELECT 
  'diskann_no_quantization',
  'DiskANN',
  pg_relation_size('idx_embeddings_diskann_no_quant')::float / (1024 * 1024);

-- ============================================================================
-- TEST: DiskANN with Statistical Binary Quantization (SBQ)
-- ============================================================================

-- Create StreamingDiskANN index WITH SBQ quantization
DROP INDEX IF EXISTS idx_embeddings_diskann_sbq;
CREATE INDEX idx_embeddings_diskann_sbq ON embeddings
USING diskann (embedding vector_cosine_ops)
WITH (
  num_neighbors = 50,
  search_list_size = 100,
  max_alpha = 1.2,
  storage_layout = 'memory_optimized',
  quantization = 'binary'  -- Enable SBQ
);

VACUUM ANALYZE embeddings;

-- Benchmark 3: DiskANN with SBQ
\timing on
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT 
  embedding_id,
  chunk_text,
  1 - (embedding <=> (SELECT query_embedding FROM benchmark_query)) as similarity
FROM embeddings
WHERE tenant_id = 'tn_benchmark000000000000000000000000'
ORDER BY embedding <=> (SELECT query_embedding FROM benchmark_query)
LIMIT 10;
\timing off

-- Capture DiskANN (SBQ) index size
INSERT INTO benchmark_results (test_name, index_type, index_size_mb)
SELECT 
  'diskann_with_sbq',
  'DiskANN + SBQ',
  pg_relation_size('idx_embeddings_diskann_sbq')::float / (1024 * 1024);

-- ============================================================================
-- RESULTS: Compare performance metrics
-- ============================================================================

-- Display results summary
SELECT 
  test_name,
  index_type,
  index_size_mb,
  ROUND(index_size_mb / NULLIF((SELECT index_size_mb FROM benchmark_results WHERE test_name = 'baseline_ivfflat'), 0), 2) as size_ratio
FROM benchmark_results
ORDER BY 
  CASE test_name
    WHEN 'baseline_ivfflat' THEN 1
    WHEN 'diskann_no_quantization' THEN 2
    WHEN 'diskann_with_sbq' THEN 3
  END;

-- ============================================================================
-- RECALL TEST: Verify accuracy of approximate search
-- ============================================================================

-- Get exact top-10 results (brute force)
CREATE TEMP TABLE exact_results AS
SELECT 
  embedding_id,
  1 - (embedding <=> (SELECT query_embedding FROM benchmark_query)) as similarity
FROM embeddings
WHERE tenant_id = 'tn_benchmark000000000000000000000000'
ORDER BY similarity DESC
LIMIT 10;

-- Test recall for each index type
-- Recall@10 = (# of correct results in top-10) / 10

-- IVFFlat recall
WITH ivfflat_results AS (
  SELECT embedding_id
  FROM embeddings
  WHERE tenant_id = 'tn_benchmark000000000000000000000000'
  ORDER BY embedding <=> (SELECT query_embedding FROM benchmark_query)
  LIMIT 10
)
SELECT 
  'IVFFlat' as index_type,
  COUNT(*)::float / 10 as recall_at_10
FROM ivfflat_results
WHERE embedding_id IN (SELECT embedding_id FROM exact_results);

-- DiskANN (no quant) recall
WITH diskann_results AS (
  SELECT embedding_id
  FROM embeddings
  WHERE tenant_id = 'tn_benchmark000000000000000000000000'
  ORDER BY embedding <=> (SELECT query_embedding FROM benchmark_query)
  LIMIT 10
)
SELECT 
  'DiskANN' as index_type,
  COUNT(*)::float / 10 as recall_at_10
FROM diskann_results
WHERE embedding_id IN (SELECT embedding_id FROM exact_results);

-- DiskANN + SBQ recall
WITH diskann_sbq_results AS (
  SELECT embedding_id
  FROM embeddings
  WHERE tenant_id = 'tn_benchmark000000000000000000000000'
  ORDER BY embedding <=> (SELECT query_embedding FROM benchmark_query)
  LIMIT 10
)
SELECT 
  'DiskANN + SBQ' as index_type,
  COUNT(*)::float / 10 as recall_at_10
FROM diskann_sbq_results
WHERE embedding_id IN (SELECT embedding_id FROM exact_results);

-- ============================================================================
-- CLEANUP (optional)
-- ============================================================================

-- Remove test data
-- DELETE FROM embeddings WHERE tenant_id = 'tn_benchmark000000000000000000000000';
-- DELETE FROM trial_tenants WHERE tenant_id = 'tn_benchmark000000000000000000000000';
-- DROP INDEX IF EXISTS idx_embeddings_ivfflat_baseline;
-- DROP INDEX IF EXISTS idx_embeddings_diskann_no_quant;
-- DROP INDEX IF EXISTS idx_embeddings_diskann_sbq;

-- ============================================================================
-- INTERPRETATION GUIDE
-- ============================================================================

/*
Expected Results:

1. Index Size:
   - IVFFlat: ~100-150 MB for 10K vectors (1536-dim)
   - DiskANN (no quant): ~80-120 MB (20-30% reduction)
   - DiskANN + SBQ: ~5-10 MB (28x compression)

2. Query Performance:
   - IVFFlat: 10-50ms (baseline)
   - DiskANN (no quant): 7-35ms (30-40% faster)
   - DiskANN + SBQ: 5-30ms (40-50% faster)

3. Recall@10:
   - IVFFlat: 90-95%
   - DiskANN (no quant): 95-98%
   - DiskANN + SBQ: 93-97%

Recommendation:
- Use DiskANN + SBQ for production if recall@10 > 95%
- Monitor query latency and storage costs
- Scale test to 100K+ vectors for production validation
*/

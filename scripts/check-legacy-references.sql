-- Check what references exist to the legacy 'embedding' column
-- Run this in SQL Editor to understand impact before renaming

-- 1. Check indexes on 'embedding' column
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexdef ILIKE '%embedding%'
  AND (tablename = 'embeddings' OR tablename = 'document_chunks')
ORDER BY tablename, indexname;

-- 2. Check which RPCs/functions reference the 'embedding' column
SELECT 
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE pg_get_functiondef(p.oid) ILIKE '%embedding%'
  AND n.nspname = 'public'
ORDER BY function_name;

-- 3. Check column existence
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'embeddings' OR table_name = 'document_chunks')
  AND column_name IN ('embedding', 'embedding_384', 'embedding_1536_archive')
ORDER BY table_name, column_name;

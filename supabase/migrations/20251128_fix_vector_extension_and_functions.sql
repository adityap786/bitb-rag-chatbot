-- Fix vector extension/operator resolution and ensure matching functions can run
-- Run this script in the Supabase SQL editor (STAGING first). Idempotent.
-- What it does:
--  1) Reports current extension placement and operator availability
--  2) Attempts to install `vector` extension if missing
--  3) Moves extensions from public to extensions schema to resolve linter warnings
--  4) Checks for conflicting vector types in public schema
--  5) Fixes column type to vector(768) if not already
--  6) Detects the schema where `vector` is installed and updates user-facing
--     functions' runtime search_path to include that schema
--  7) Recreates the two matching RPCs and `set_tenant_context` with safe bodies
--  8) Emits validation queries showing operators and function proconfig

-- NOTE: This script does NOT move extensions between schemas. If the extension
--       lives in a non-public schema and you prefer moving it, do that separately
--       using a tested index and extension migration.

-- ---------- Diagnostic: current extension/operator state
SELECT e.extname, n.nspname AS ext_schema, e.extversion
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE e.extname IN ('vector','pgvector','pg_trgm');

SELECT o.oid, o.oprname, ns.nspname AS opr_schema,
       lt.typname AS left_type, rt.typname AS right_type
FROM pg_operator o
LEFT JOIN pg_namespace ns ON o.oprnamespace = ns.oid
LEFT JOIN pg_type lt ON o.oprleft = lt.oid
LEFT JOIN pg_type rt ON o.oprright = rt.oid
WHERE o.oprname IN ('<->','<#>','<=>')
ORDER BY o.oprname, ns.nspname;

SELECT column_name, udt_schema, udt_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='vector_documents' AND column_name='embedding_768';

-- ---------- Ensure vector extension exists (idempotent attempt)
-- Try the common names; this is safe to run in staging. If your managed DB
-- restricts extension creation, this will be a no-op or raise a permissions error.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CREATE EXTENSION vector failed or not permitted: %', SQLERRM;
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgvector WITH SCHEMA public;
  EXCEPTION WHEN OTHERS THEN
    -- Some systems call the extension `vector` while others use `pgvector`.
    NULL;
  END;

  -- Ensure pg_trgm present (commonly used); optional
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CREATE EXTENSION pg_trgm failed or not permitted: %', SQLERRM;
  END;
END$$;

-- ---------- Move extensions out of public schema to extensions (resolves linter warnings)
DO $$
DECLARE ext_schema TEXT;
BEGIN
  -- Move vector if in public
  SELECT n.nspname INTO ext_schema FROM pg_extension e JOIN pg_namespace n ON e.extnamespace = n.oid WHERE e.extname IN ('vector','pgvector');
  IF ext_schema = 'public' THEN
    BEGIN
      ALTER EXTENSION vector SET SCHEMA extensions;
      RAISE NOTICE 'Moved vector extension to extensions schema';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to move vector extension: %', SQLERRM;
    END;
  END IF;

  -- Move pg_trgm if in public
  SELECT n.nspname INTO ext_schema FROM pg_extension e JOIN pg_namespace n ON e.extnamespace = n.oid WHERE e.extname = 'pg_trgm';
  IF ext_schema = 'public' THEN
    BEGIN
      ALTER EXTENSION pg_trgm SET SCHEMA extensions;
      RAISE NOTICE 'Moved pg_trgm extension to extensions schema';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to move pg_trgm extension: %', SQLERRM;
    END;
  END IF;
END$$;

-- ---------- Check for conflicting vector type and fix column type if needed
DO $$
DECLARE
  col_udt_schema TEXT;
  col_udt_name TEXT;
  ext_schema TEXT;
BEGIN
  -- Get current column type
  SELECT udt_schema, udt_name INTO col_udt_schema, col_udt_name
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='vector_documents' AND column_name='embedding_768';
  
  IF col_udt_name IS NULL THEN
    RAISE NOTICE 'Column embedding_768 not found. Skipping type fix.';
    RETURN;
  END IF;
  
  -- Check if there's a conflicting type named 'vector' in public
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typname = 'vector') THEN
    RAISE WARNING 'Conflicting type named vector exists in public schema. This may cause operator resolution issues. Consider dropping or renaming it.';
  END IF;
  
  -- Get extension schema
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname IN ('vector','pgvector')
  LIMIT 1;
  
  IF ext_schema IS NULL THEN
    RAISE NOTICE 'Vector extension not found. Cannot fix column type.';
    RETURN;
  END IF;
  
  -- If column is not vector, try to alter it
  IF col_udt_name != 'vector' OR col_udt_schema != ext_schema THEN
    BEGIN
      EXECUTE format('ALTER TABLE public.vector_documents ALTER COLUMN embedding_768 TYPE vector(768) USING embedding_768::%I.vector', ext_schema);
      RAISE NOTICE 'Altered column embedding_768 to vector(768)';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to alter column embedding_768: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Column embedding_768 is already vector(768) in correct schema.';
  END IF;
END$$;

-- ---------- Detect where the vector extension is installed
DO $$
DECLARE
  ext_schema TEXT;
  r RECORD;
  target_names TEXT[] := ARRAY[
    'match_embeddings_by_tenant', 'match_embeddings_by_tenant_768', 'set_tenant_context',
    'increment_tenant_usage', 'update_updated_at_column', 'update_session_activity',
    'cleanup_expired_admin_tokens', 'check_tenant_quota', 'cleanup_expired_sessions'
  ];
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname IN ('vector','pgvector')
  LIMIT 1;

  IF ext_schema IS NULL THEN
    RAISE NOTICE 'Vector extension not found after CREATE attempts. Operator may be missing. Inspect above diagnostics.';
    RETURN;
  END IF;

  RAISE NOTICE 'Vector extension schema detected: %', ext_schema;

  -- For each flagged function in public, set a runtime search_path including the extension schema
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = ANY(target_names)
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = %L',
        r.schema, r.name, r.args, ('pg_catalog, ' || ext_schema || ', public')
      );
      RAISE NOTICE 'Updated search_path for function %I.%I(%s)', r.schema, r.name, r.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to set search_path for function %: %', r.name, SQLERRM;
    END;
  END LOOP;
END$$;

-- ---------- Recreate key SQL RPCs (idempotent CREATE OR REPLACE)
-- These match the earlier migration bodies and will compile now that the extension
-- schema is on the function runtime search_path.

CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.current_tenant', p_tenant_id, true);
$$;

CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant_768(query_embedding vector, match_count int, p_tenant_id text)
RETURNS TABLE (id uuid, tenant_id text, content text, metadata jsonb, similarity double precision)
AS $fn$
  SELECT d.id, d.tenant_id, d.content, d.metadata,
    1.0 / (1 + (d.embedding_768 <-> query_embedding)) AS similarity
  FROM public.vector_documents d
  WHERE d.tenant_id = p_tenant_id
    AND d.embedding_768 IS NOT NULL
  ORDER BY d.embedding_768 <-> query_embedding
  LIMIT match_count;
$fn$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(query_embedding vector, match_count int, p_tenant_id text)
RETURNS TABLE (id uuid, tenant_id text, content text, metadata jsonb, similarity double precision)
AS $fn$
  SELECT d.id, d.tenant_id, d.content, d.metadata,
    1.0 / (1 + (d.embedding_768 <-> query_embedding)) AS similarity
  FROM public.vector_documents d
  WHERE d.tenant_id = p_tenant_id
    AND d.embedding_768 IS NOT NULL
  ORDER BY d.embedding_768 <-> query_embedding
  LIMIT match_count;
$fn$ LANGUAGE sql STABLE;

-- ---------- Validation outputs
-- Show operator(s) again to confirm the vector distance operator is present
SELECT o.oid, o.oprname, ns.nspname AS opr_schema,
       lt.typname AS left_type, rt.typname AS right_type
FROM pg_operator o
LEFT JOIN pg_namespace ns ON o.oprnamespace = ns.oid
LEFT JOIN pg_type lt ON o.oprleft = lt.oid
LEFT JOIN pg_type rt ON o.oprright = rt.oid
WHERE o.oprname = '<->'
ORDER BY ns.nspname;

-- Show updated function runtime configs (proconfig)
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname LIKE 'match_embeddings_by_tenant%';

-- End of script

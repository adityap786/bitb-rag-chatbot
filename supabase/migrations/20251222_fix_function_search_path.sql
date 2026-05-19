-- ============================================================
-- Security Fix: Function Search Path Hardening
-- Migration: 20251222_fix_function_search_path.sql
-- 
-- Fixes Supabase Advisor warning:
--   function_search_path_mutable (0011)
--   "Function has a role mutable search_path"
-- 
-- SECURITY ISSUE:
-- Functions without explicit search_path can be exploited via
-- search_path injection. An attacker could create malicious objects
-- in a schema that appears earlier in the search path.
-- 
-- FIX:
-- Set search_path = '' (empty) to require fully qualified names,
-- preventing search_path manipulation attacks.
-- ============================================================

-- ============================================================
-- 1. Fix get_current_tenant_id (CRITICAL - used in all RLS policies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_current_tenant_id() 
RETURNS text 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('app.tenant_id', true),
    (auth.jwt() ->> 'tenant_id')::text
  );
$$;

COMMENT ON FUNCTION public.get_current_tenant_id IS 
  'Returns current tenant_id from session variable or JWT. Used in all RLS policies.';

-- ============================================================
-- 2. Fix set_tenant_context
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id, false);
END;
$$;

COMMENT ON FUNCTION public.set_tenant_context IS 
  'Sets the tenant context for RLS policies. Must be called before tenant-scoped queries.';

-- ============================================================
-- 3. Fix match_embeddings_by_tenant
-- NOTE: Must DROP first because return type is changing
-- ============================================================
DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant(vector, int, text);
DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant(vector(768), int, text);

CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant(
  query_embedding vector(768),
  match_count int,
  p_tenant_id text
)
RETURNS TABLE(
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.content,
    1 - (e.embedding_768 <=> query_embedding) AS similarity
  FROM public.embeddings e
  WHERE e.tenant_id = p_tenant_id
    AND e.embedding_768 IS NOT NULL
  ORDER BY e.embedding_768 <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_embeddings_by_tenant IS 
  'Vector similarity search with mandatory tenant isolation.';

-- ============================================================
-- 4. Fix match_embeddings_by_tenant_768 (if exists)
-- NOTE: Must DROP first because return type is changing
-- ============================================================
DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant_768(vector, int, text);
DROP FUNCTION IF EXISTS public.match_embeddings_by_tenant_768(vector(768), int, text);

CREATE OR REPLACE FUNCTION public.match_embeddings_by_tenant_768(
  query_embedding vector(768),
  match_count int,
  p_tenant_id text
)
RETURNS TABLE(
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.content,
    1 - (e.embedding_768 <=> query_embedding) AS similarity
  FROM public.embeddings e
  WHERE e.tenant_id = p_tenant_id
    AND e.embedding_768 IS NOT NULL
  ORDER BY e.embedding_768 <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 5. Fix increment_tenant_usage
-- NOTE: DROP first in case return type differs
-- ============================================================
DROP FUNCTION IF EXISTS public.increment_tenant_usage(text, text, integer);
DROP FUNCTION IF EXISTS public.increment_tenant_usage(text, text);
CREATE OR REPLACE FUNCTION public.increment_tenant_usage(
  p_tenant_id text,
  p_field text,
  p_amount integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update or insert usage record
  INSERT INTO public.tenant_usage (tenant_id, period_start, period_end, queries_used)
  VALUES (
    p_tenant_id,
    date_trunc('day', now()),
    date_trunc('day', now()) + interval '1 day',
    CASE WHEN p_field = 'queries_used' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (tenant_id, period_start)
  DO UPDATE SET 
    queries_used = public.tenant_usage.queries_used + 
      CASE WHEN p_field = 'queries_used' THEN p_amount ELSE 0 END,
    updated_at = now();
END;
$$;

-- ============================================================
-- 6. Fix check_tenant_quota
-- NOTE: DROP first in case return type differs
-- ============================================================
DROP FUNCTION IF EXISTS public.check_tenant_quota(text, text);
DROP FUNCTION IF EXISTS public.check_tenant_quota(text);
CREATE OR REPLACE FUNCTION public.check_tenant_quota(
  p_tenant_id text,
  p_quota_type text DEFAULT 'queries_per_day'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quota_limit integer;
  v_current_usage integer;
BEGIN
  -- Get quota limit from tenants table
  SELECT (quota->>p_quota_type)::integer INTO v_quota_limit
  FROM public.tenants
  WHERE tenant_id = p_tenant_id;
  
  IF v_quota_limit IS NULL THEN
    v_quota_limit := 100; -- Default
  END IF;
  
  -- Get current usage
  SELECT COALESCE(queries_used, 0) INTO v_current_usage
  FROM public.tenant_usage
  WHERE tenant_id = p_tenant_id
    AND period_start = date_trunc('day', now());
  
  RETURN COALESCE(v_current_usage, 0) < v_quota_limit;
END;
$$;

-- ============================================================
-- 7. Fix cleanup_expired_sessions
-- NOTE: DROP first in case return type differs
-- ============================================================
DROP FUNCTION IF EXISTS public.cleanup_expired_sessions();
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.chat_sessions
  WHERE expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================
-- 8. Fix cleanup_expired_admin_tokens
-- NOTE: DROP first in case return type differs
-- ============================================================
DROP FUNCTION IF EXISTS public.cleanup_expired_admin_tokens();
CREATE OR REPLACE FUNCTION public.cleanup_expired_admin_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.admin_refresh_tokens
  WHERE expires_at < now()
    OR revoked_at IS NOT NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================
-- 9. Fix update_updated_at_column (used by triggers)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column IS 
  'Trigger function to auto-update updated_at timestamp.';

-- ============================================================
-- 10. Fix update_session_activity
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_session_activity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.last_activity = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 11. Fix GDPR functions (from previous migration)
-- NOTE: DROP first in case return type differs
-- ============================================================
DROP FUNCTION IF EXISTS public.gdpr_delete_user_data(text, text, text);
DROP FUNCTION IF EXISTS public.gdpr_delete_user_data(text, text);
CREATE OR REPLACE FUNCTION public.gdpr_delete_user_data(
  p_tenant_id text,
  p_user_id text,
  p_reason text DEFAULT 'User request'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_chats integer := 0;
  v_deleted_docs integer := 0;
  v_deleted_embeddings integer := 0;
  v_anonymized_logs integer := 0;
  v_doc_ids uuid[];
  v_deletion_id text;
BEGIN
  -- Generate deletion ID
  v_deletion_id := 'gdpr_del_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || 
                   substr(md5(random()::text), 1, 9);
  
  -- 1. Get document IDs for this user
  SELECT ARRAY_AGG(kb_id) INTO v_doc_ids
  FROM public.knowledge_base
  WHERE tenant_id = p_tenant_id AND metadata->>'uploaded_by' = p_user_id;
  
  -- 2. Delete embeddings
  IF v_doc_ids IS NOT NULL AND array_length(v_doc_ids, 1) > 0 THEN
    DELETE FROM public.embeddings 
    WHERE tenant_id = p_tenant_id AND kb_id = ANY(v_doc_ids);
    GET DIAGNOSTICS v_deleted_embeddings = ROW_COUNT;
  END IF;
  
  -- 3. Delete documents
  DELETE FROM public.knowledge_base 
  WHERE tenant_id = p_tenant_id AND metadata->>'uploaded_by' = p_user_id;
  GET DIAGNOSTICS v_deleted_docs = ROW_COUNT;
  
  -- 4. Delete chat sessions
  DELETE FROM public.chat_sessions 
  WHERE tenant_id = p_tenant_id AND visitor_id = p_user_id;
  GET DIAGNOSTICS v_deleted_chats = ROW_COUNT;
  
  -- 5. Log the deletion
  INSERT INTO public.gdpr_deletion_log (
    id, tenant_id, user_id_hash, deleted_at, reason, summary, requested_by
  ) VALUES (
    v_deletion_id,
    p_tenant_id,
    encode(sha256(p_user_id::bytea), 'hex'),
    NOW(),
    p_reason,
    jsonb_build_object(
      'chat_sessions', v_deleted_chats,
      'documents', v_deleted_docs,
      'embeddings', v_deleted_embeddings
    ),
    'database_function'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'deletion_id', v_deletion_id,
    'deleted', jsonb_build_object(
      'chat_sessions', v_deleted_chats,
      'documents', v_deleted_docs,
      'embeddings', v_deleted_embeddings
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

DROP FUNCTION IF EXISTS public.gdpr_export_user_data(text, text);

CREATE OR REPLACE FUNCTION public.gdpr_export_user_data(
  p_tenant_id text,
  p_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chat_sessions jsonb;
  v_documents jsonb;
BEGIN
  -- Get chat sessions
  SELECT COALESCE(jsonb_agg(row_to_json(cs)), '[]'::jsonb)
  INTO v_chat_sessions
  FROM (
    SELECT session_id, created_at, last_activity, messages
    FROM public.chat_sessions
    WHERE tenant_id = p_tenant_id AND visitor_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1000
  ) cs;
  
  -- Get documents
  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
  INTO v_documents
  FROM (
    SELECT kb_id, source_type, created_at, metadata
    FROM public.knowledge_base
    WHERE tenant_id = p_tenant_id AND metadata->>'uploaded_by' = p_user_id
    ORDER BY created_at DESC
    LIMIT 500
  ) d;
  
  RETURN jsonb_build_object(
    'export_date', NOW(),
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'data', jsonb_build_object(
      'chat_sessions', v_chat_sessions,
      'documents', v_documents
    )
  );
END;
$$;

-- ============================================================
-- Grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id TO service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_context TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_context TO service_role;
GRANT EXECUTE ON FUNCTION public.match_embeddings_by_tenant TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_embeddings_by_tenant TO service_role;
GRANT EXECUTE ON FUNCTION public.match_embeddings_by_tenant_768 TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_embeddings_by_tenant_768 TO service_role;
GRANT EXECUTE ON FUNCTION public.gdpr_delete_user_data TO authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_export_user_data TO authenticated;

-- ============================================================
-- Verification: List functions with search_path set correctly
-- ============================================================
-- You can verify with:
-- SELECT proname, prosecdef, proconfig 
-- FROM pg_proc 
-- WHERE pronamespace = 'public'::regnamespace
-- AND proconfig IS NOT NULL;

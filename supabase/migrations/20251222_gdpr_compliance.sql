-- GDPR Compliance Tables and Functions
-- Migration: 20251222_gdpr_compliance.sql
-- 
-- Creates tables and functions for GDPR compliance:
-- 1. gdpr_deletion_log - Immutable log of all GDPR deletions
-- 2. gdpr_delete_user_data() - Function to delete all user data
-- 3. gdpr_export_user_data() - Function to export all user data

-- ============================================
-- 1. GDPR Deletion Log Table
-- ============================================
-- Stores immutable records of all GDPR deletion requests
-- Required for compliance audit trail

CREATE TABLE IF NOT EXISTS gdpr_deletion_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id_hash TEXT NOT NULL,  -- Hashed user ID (PII removed)
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  summary JSONB NOT NULL DEFAULT '{}',
  requested_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for compliance queries
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_log_tenant 
  ON gdpr_deletion_log(tenant_id, deleted_at);

-- Make the table immutable (no updates or deletes allowed)
ALTER TABLE gdpr_deletion_log ENABLE ROW LEVEL SECURITY;

-- Policy: Allow insert only
CREATE POLICY gdpr_deletion_insert ON gdpr_deletion_log
  FOR INSERT
  WITH CHECK (true);

-- Policy: Prevent updates
CREATE POLICY gdpr_deletion_no_update ON gdpr_deletion_log
  FOR UPDATE
  USING (false);

-- Policy: Prevent deletes
CREATE POLICY gdpr_deletion_no_delete ON gdpr_deletion_log
  FOR DELETE
  USING (false);

-- Policy: Allow select for audit purposes
CREATE POLICY gdpr_deletion_select ON gdpr_deletion_log
  FOR SELECT
  USING (true);

-- ============================================
-- 2. GDPR Delete User Data Function
-- ============================================
-- Deletes all user data and returns summary

CREATE OR REPLACE FUNCTION gdpr_delete_user_data(
  p_tenant_id TEXT,
  p_user_id TEXT,
  p_reason TEXT DEFAULT 'User request'
)
RETURNS JSONB AS $$
DECLARE
  v_deleted_chats INT := 0;
  v_deleted_docs INT := 0;
  v_deleted_embeddings INT := 0;
  v_anonymized_logs INT := 0;
  v_doc_ids UUID[];
  v_deletion_id TEXT;
BEGIN
  -- Generate deletion ID
  v_deletion_id := 'gdpr_del_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || 
                   substr(md5(random()::text), 1, 9);
  
  -- 1. Get document IDs for this user (needed for embedding deletion)
  SELECT ARRAY_AGG(id) INTO v_doc_ids
  FROM knowledge_base
  WHERE tenant_id = p_tenant_id AND uploaded_by = p_user_id;
  
  -- 2. Delete embeddings for user's documents
  IF v_doc_ids IS NOT NULL AND array_length(v_doc_ids, 1) > 0 THEN
    DELETE FROM embeddings 
    WHERE tenant_id = p_tenant_id AND document_id = ANY(v_doc_ids);
    GET DIAGNOSTICS v_deleted_embeddings = ROW_COUNT;
  END IF;
  
  -- 3. Delete user's documents
  DELETE FROM knowledge_base 
  WHERE tenant_id = p_tenant_id AND uploaded_by = p_user_id;
  GET DIAGNOSTICS v_deleted_docs = ROW_COUNT;
  
  -- 4. Delete chat sessions
  DELETE FROM chat_sessions 
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_chats = ROW_COUNT;
  
  -- 5. Anonymize audit logs (keep for compliance)
  UPDATE rag_audit_log 
  SET 
    user_id = 'GDPR_DELETED',
    query_hash = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) - 'user_agent' - 'ip_address' - 'email'
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  GET DIAGNOSTICS v_anonymized_logs = ROW_COUNT;
  
  -- 6. Log the deletion (for compliance)
  INSERT INTO gdpr_deletion_log (
    id,
    tenant_id,
    user_id_hash,
    deleted_at,
    reason,
    summary,
    requested_by
  ) VALUES (
    v_deletion_id,
    p_tenant_id,
    encode(sha256(p_user_id::bytea), 'hex'),
    NOW(),
    p_reason,
    jsonb_build_object(
      'chat_sessions', v_deleted_chats,
      'documents', v_deleted_docs,
      'embeddings', v_deleted_embeddings,
      'audit_logs_anonymized', v_anonymized_logs
    ),
    'database_function'
  );
  
  -- Return summary
  RETURN jsonb_build_object(
    'success', true,
    'deletion_id', v_deletion_id,
    'deleted', jsonb_build_object(
      'chat_sessions', v_deleted_chats,
      'documents', v_deleted_docs,
      'embeddings', v_deleted_embeddings,
      'audit_logs_anonymized', v_anonymized_logs
    ),
    'deleted_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. GDPR Export User Data Function
-- ============================================
-- Returns all user data in JSONB format for export

CREATE OR REPLACE FUNCTION gdpr_export_user_data(
  p_tenant_id TEXT,
  p_user_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_chat_sessions JSONB;
  v_documents JSONB;
  v_embeddings_count INT;
  v_audit_logs JSONB;
  v_first_activity TIMESTAMPTZ;
  v_last_activity TIMESTAMPTZ;
BEGIN
  -- 1. Get chat sessions
  SELECT COALESCE(jsonb_agg(row_to_json(cs)), '[]'::jsonb)
  INTO v_chat_sessions
  FROM (
    SELECT id, created_at, updated_at, messages, metadata
    FROM chat_sessions
    WHERE tenant_id = p_tenant_id AND user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1000
  ) cs;
  
  -- 2. Get documents
  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
  INTO v_documents
  FROM (
    SELECT id, filename, source_type, source_url, created_at, updated_at, metadata
    FROM knowledge_base
    WHERE tenant_id = p_tenant_id AND uploaded_by = p_user_id
    ORDER BY created_at DESC
    LIMIT 500
  ) d;
  
  -- 3. Count embeddings (don't export vectors, just count)
  SELECT COUNT(*)
  INTO v_embeddings_count
  FROM embeddings e
  JOIN knowledge_base kb ON e.document_id = kb.id
  WHERE kb.tenant_id = p_tenant_id AND kb.uploaded_by = p_user_id;
  
  -- 4. Get sanitized audit logs
  SELECT COALESCE(jsonb_agg(row_to_json(al)), '[]'::jsonb)
  INTO v_audit_logs
  FROM (
    SELECT created_at, operation, chunks_returned, latency_ms
    FROM rag_audit_log
    WHERE tenant_id = p_tenant_id AND user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1000
  ) al;
  
  -- 5. Calculate activity range
  SELECT MIN(created_at), MAX(created_at)
  INTO v_first_activity, v_last_activity
  FROM (
    SELECT created_at FROM chat_sessions WHERE tenant_id = p_tenant_id AND user_id = p_user_id
    UNION ALL
    SELECT created_at FROM knowledge_base WHERE tenant_id = p_tenant_id AND uploaded_by = p_user_id
  ) combined;
  
  -- Return export package
  RETURN jsonb_build_object(
    'export_date', NOW(),
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'format_version', '1.0.0',
    'data', jsonb_build_object(
      'chat_sessions', v_chat_sessions,
      'documents_uploaded', v_documents,
      'embeddings_count', v_embeddings_count,
      'activity_logs', v_audit_logs
    ),
    'metadata', jsonb_build_object(
      'total_chats', jsonb_array_length(v_chat_sessions),
      'total_documents', jsonb_array_length(v_documents),
      'first_activity', v_first_activity,
      'last_activity', v_last_activity
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Grant Permissions
-- ============================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION gdpr_delete_user_data(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION gdpr_export_user_data(TEXT, TEXT) TO authenticated;

-- Grant insert on deletion log
GRANT INSERT ON gdpr_deletion_log TO authenticated;
GRANT SELECT ON gdpr_deletion_log TO authenticated;

-- ============================================
-- 5. Add Comments for Documentation
-- ============================================

COMMENT ON TABLE gdpr_deletion_log IS 
  'Immutable audit log of all GDPR deletion requests. Cannot be updated or deleted.';

COMMENT ON FUNCTION gdpr_delete_user_data IS 
  'GDPR Article 17 - Right to Erasure. Deletes all user data and anonymizes audit logs.';

COMMENT ON FUNCTION gdpr_export_user_data IS 
  'GDPR Article 15 - Right of Access. Exports all user data in portable JSON format.';

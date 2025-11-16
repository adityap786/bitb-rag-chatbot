/**
 * Audit Logging Service
 * 
 * Logs security-relevant events with SHA-256 hashing for queries.
 * Never stores plaintext sensitive data. Integrates with Supabase audit_logs table.
 * 
 * Features:
 * - SHA-256 query hashing (no plaintext storage)
 * - Tenant isolation
 * - Event categorization
 * - Metadata tracking
 * - Performance metrics
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Audit event types
 */
export enum AuditEventType {
  // Query events
  RAG_QUERY = 'rag_query',
  RAG_QUERY_SUCCESS = 'rag_query_success',
  RAG_QUERY_FAILURE = 'rag_query_failure',
  RAG_QUERY_LIMIT_EXCEEDED = 'rag_query_limit_exceeded',

  // Ingestion events
  DOCUMENT_INGEST_START = 'document_ingest_start',
  DOCUMENT_INGEST_SUCCESS = 'document_ingest_success',
  DOCUMENT_INGEST_FAILURE = 'document_ingest_failure',

  // Trial events
  TRIAL_CREATED = 'trial_created',
  TRIAL_EXPIRED = 'trial_expired',
  TRIAL_UPGRADED = 'trial_upgraded',

  // Settings events
  SETTINGS_UPDATED = 'settings_updated',

  // Security events
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  INVALID_TENANT_ID = 'invalid_tenant_id',
  INVALID_TRIAL_TOKEN = 'invalid_trial_token',
  PII_DETECTED = 'pii_detected',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',

  // MCP events
  MCP_TOOL_INVOKED = 'mcp_tool_invoked',
  MCP_TOOL_SUCCESS = 'mcp_tool_success',
  MCP_TOOL_FAILURE = 'mcp_tool_failure',
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  tenant_id: string;
  event_type: AuditEventType;
  event_data?: Record<string, unknown>;
  metadata?: {
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    execution_time_ms?: number;
    [key: string]: unknown;
  };
  created_at?: string;
}

/**
 * Hash sensitive data for logging
 */
export function hashSensitiveData(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Log audit event to database
 */
export async function logAuditEvent(
  entry: AuditLogEntry
): Promise<void> {
  // Skip if Supabase not configured (dev environment)
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Audit] Supabase not configured, logging to console:', entry);
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Set tenant context for RLS
    await supabase.rpc('set_tenant_context', { tenant_id: entry.tenant_id });

    // Insert audit log
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        tenant_id: entry.tenant_id,
        event_type: entry.event_type,
        event_data: entry.event_data || {},
        metadata: entry.metadata || {},
        created_at: entry.created_at || new Date().toISOString(),
      });

    if (error) {
      console.error('[Audit] Failed to log event:', error);
    }
  } catch (error) {
    console.error('[Audit] Exception logging event:', error);
  }
}

/**
 * Audit logger with pre-configured helpers
 */
export const AuditLogger = {
  /**
   * Log RAG query (hashed)
   */
  async logRagQuery(
    tenant_id: string,
    query: string,
    options?: {
      trial_token?: string;
      result_count?: number;
      execution_time_ms?: number;
      success?: boolean;
    }
  ): Promise<void> {
    const query_hash = hashSensitiveData(query);
    
    await logAuditEvent({
      tenant_id,
      event_type: options?.success !== false ? AuditEventType.RAG_QUERY_SUCCESS : AuditEventType.RAG_QUERY_FAILURE,
      event_data: {
        query_hash, // Never store plaintext query
        query_length: query.length,
        result_count: options?.result_count,
        trial_token: options?.trial_token,
      },
      metadata: {
        execution_time_ms: options?.execution_time_ms,
      },
    });
  },

  /**
   * Log document ingestion
   */
  async logDocumentIngest(
    tenant_id: string,
    options: {
      document_count: number;
      chunk_count: number;
      total_chars: number;
      job_id?: string;
      success?: boolean;
    }
  ): Promise<void> {
    await logAuditEvent({
      tenant_id,
      event_type: options.success !== false 
        ? AuditEventType.DOCUMENT_INGEST_SUCCESS 
        : AuditEventType.DOCUMENT_INGEST_FAILURE,
      event_data: {
        document_count: options.document_count,
        chunk_count: options.chunk_count,
        total_chars: options.total_chars,
        job_id: options.job_id,
      },
    });
  },

  /**
   * Log trial creation
   */
  async logTrialCreated(
    tenant_id: string,
    options: {
      trial_token: string;
      site_origin: string;
      admin_email?: string;
    }
  ): Promise<void> {
    await logAuditEvent({
      tenant_id,
      event_type: AuditEventType.TRIAL_CREATED,
      event_data: {
        trial_token: options.trial_token,
        site_origin: options.site_origin,
        admin_email_hash: options.admin_email ? hashSensitiveData(options.admin_email) : undefined,
      },
    });
  },

  /**
   * Log settings update
   */
  async logSettingsUpdate(
    tenant_id: string,
    updated_fields: string[]
  ): Promise<void> {
    await logAuditEvent({
      tenant_id,
      event_type: AuditEventType.SETTINGS_UPDATED,
      event_data: {
        updated_fields,
      },
    });
  },

  /**
   * Log PII detection
   */
  async logPIIDetection(
    tenant_id: string,
    pii_types: string[],
    query_hash: string
  ): Promise<void> {
    await logAuditEvent({
      tenant_id,
      event_type: AuditEventType.PII_DETECTED,
      event_data: {
        pii_types,
        query_hash, // Store hash for correlation
        count: pii_types.length,
      },
    });
  },

  /**
   * Log unauthorized access attempt
   */
  async logUnauthorizedAccess(
    tenant_id: string,
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await logAuditEvent({
      tenant_id,
      event_type: AuditEventType.UNAUTHORIZED_ACCESS,
      event_data: {
        reason,
        timestamp: new Date().toISOString(),
      },
      metadata,
    });
  },

  /**
   * Log rate limit exceeded
   */
  async logRateLimitExceeded(
    tenant_id: string,
    options: {
      limit_type: string;
      current_count: number;
      limit: number;
    }
  ): Promise<void> {
    await logAuditEvent({
      tenant_id,
      event_type: AuditEventType.RATE_LIMIT_EXCEEDED,
      event_data: {
        limit_type: options.limit_type,
        current_count: options.current_count,
        limit: options.limit,
      },
    });
  },

  /**
   * Log MCP tool invocation
   */
  async logMCPToolInvocation(
    tenant_id: string,
    tool_name: string,
    options?: {
      success?: boolean;
      execution_time_ms?: number;
      error_code?: string;
    }
  ): Promise<void> {
    await logAuditEvent({
      tenant_id,
      event_type: options?.success !== false 
        ? AuditEventType.MCP_TOOL_SUCCESS 
        : AuditEventType.MCP_TOOL_FAILURE,
      event_data: {
        tool_name,
        error_code: options?.error_code,
      },
      metadata: {
        execution_time_ms: options?.execution_time_ms,
      },
    });
  },
};

/**
 * Query audit logs (for analytics/debugging)
 */
export async function queryAuditLogs(
  tenant_id: string,
  options?: {
    event_types?: AuditEventType[];
    start_date?: string;
    end_date?: string;
    limit?: number;
  }
): Promise<AuditLogEntry[]> {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Audit] Supabase not configured');
    return [];
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.rpc('set_tenant_context', { tenant_id });

    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false });

    if (options?.event_types && options.event_types.length > 0) {
      query = query.in('event_type', options.event_types);
    }

    if (options?.start_date) {
      query = query.gte('created_at', options.start_date);
    }

    if (options?.end_date) {
      query = query.lte('created_at', options.end_date);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Audit] Failed to query logs:', error);
      return [];
    }

    return data as AuditLogEntry[];
  } catch (error) {
    console.error('[Audit] Exception querying logs:', error);
    return [];
  }
}

/**
 * Example usage:
 * 
 * // Log a RAG query
 * await AuditLogger.logRagQuery(
 *   'tn_abc123...',
 *   'What is BiTB?',
 *   {
 *     trial_token: 'tr_def456...',
 *     result_count: 3,
 *     execution_time_ms: 234,
 *     success: true,
 *   }
 * );
 * 
 * // Log PII detection
 * await AuditLogger.logPIIDetection(
 *   'tn_abc123...',
 *   ['email', 'phone'],
 *   hashSensitiveData('sensitive query')
 * );
 * 
 * // Query logs
 * const logs = await queryAuditLogs('tn_abc123...', {
 *   event_types: [AuditEventType.RAG_QUERY_SUCCESS],
 *   limit: 100,
 * });
 */

import type { AuditEventPayload } from '../../types/trial';
import { createLazyServiceClient } from '../supabase-client';

const supabase = createLazyServiceClient();

/**
 * AuditLogger - Records all tenant operations for compliance, debugging, and auditing
 *
 * Usage:
 * ```typescript
 * await auditLog('kb_upload', {
 *   tenant_id: tenantId,
 *   entity_type: 'knowledge_base',
 *   entity_id: kbId,
 *   action: 'create',
 *   actor_type: 'tenant',
 *   result: 'success',
 *   new_values: { filename: 'docs.pdf' },
 * });
 * ```
 */

/**
 * Log an audit event to the database
 */
export async function auditLog(eventType: string, payload: AuditEventPayload): Promise<void> {
  try {
    await supabase.from('audit_events').insert([
      {
        tenant_id: payload.tenant_id,
        event_type: eventType,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        action: payload.action,
        actor_type: payload.actor_type || 'system',
        actor_id: payload.actor_id,
        old_values: payload.old_values,
        new_values: payload.new_values,
        changes_summary: payload.changes_summary,
        result: payload.result || 'success',
        error_message: payload.error_message,
        ip_address: payload.ip_address,
        user_agent: payload.user_agent,
        request_id: payload.request_id,
        timestamp: new Date().toISOString(),
      },
    ]);
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit logging failures shouldn't break main operations
  }
}

/**
 * Trial-related audit events
 */
export const TrialAudit = {
  async created(tenantId: string, data: { email: string; businessName: string; businessType: string }) {
    return auditLog('trial_created', {
      tenant_id: tenantId,
      event_type: 'trial_created',
      entity_type: 'trial',
      entity_id: tenantId,
      action: 'create',
      actor_type: 'system',
      result: 'success',
      new_values: data,
    });
  },

  async upgraded(tenantId: string, from: string, to: string) {
    return auditLog('trial_upgraded', {
      tenant_id: tenantId,
      event_type: 'trial_upgraded',
      entity_type: 'trial',
      entity_id: tenantId,
      action: 'update',
      actor_type: 'admin',
      result: 'success',
      old_values: { plan: from },
      new_values: { plan: to },
      changes_summary: `Plan upgraded from ${from} to ${to}`,
    });
  },

  async extended(tenantId: string, days: number, newExpiryDate: string) {
    return auditLog('trial_extended', {
      tenant_id: tenantId,
      event_type: 'trial_extended',
      entity_type: 'trial',
      entity_id: tenantId,
      action: 'update',
      actor_type: 'admin',
      result: 'success',
      new_values: { days_extended: days, new_expiry: newExpiryDate },
      changes_summary: `Trial extended by ${days} days until ${newExpiryDate}`,
    });
  },

  async expired(tenantId: string) {
    return auditLog('trial_expired', {
      tenant_id: tenantId,
      event_type: 'trial_expired',
      entity_type: 'trial',
      entity_id: tenantId,
      action: 'update',
      actor_type: 'system',
      result: 'success',
      new_values: { status: 'expired' },
      changes_summary: 'Trial automatically expired',
    });
  },

  async cancelled(tenantId: string, reason?: string) {
    return auditLog('trial_cancelled', {
      tenant_id: tenantId,
      event_type: 'trial_cancelled',
      entity_type: 'trial',
      entity_id: tenantId,
      action: 'update',
      actor_type: 'admin',
      result: 'success',
      new_values: { status: 'cancelled', reason },
      changes_summary: `Trial cancelled: ${reason || 'No reason provided'}`,
    });
  },
};

/**
 * Knowledge Base audit events
 */
export const KBaudit = {
  async uploaded(tenantId: string, kbId: string, filename: string, size: number) {
    return auditLog('kb_uploaded', {
      tenant_id: tenantId,
      event_type: 'kb_uploaded',
      entity_type: 'knowledge_base',
      entity_id: kbId,
      action: 'create',
      actor_type: 'tenant',
      result: 'success',
      new_values: { filename, size_bytes: size, source_type: 'upload' },
      changes_summary: `Knowledge base document uploaded: ${filename} (${size} bytes)`,
    });
  },

  async uploadFailed(tenantId: string, filename: string, error: string) {
    return auditLog('kb_upload_failed', {
      tenant_id: tenantId,
      event_type: 'kb_upload_failed',
      entity_type: 'knowledge_base',
      action: 'create',
      actor_type: 'tenant',
      result: 'failure',
      error_message: error,
      new_values: { filename, error },
      changes_summary: `Knowledge base upload failed: ${filename}`,
    });
  },

  async crawled(tenantId: string, jobId: string, startUrl: string, pagesCount: number) {
    return auditLog('kb_crawled', {
      tenant_id: tenantId,
      event_type: 'kb_crawled',
      entity_type: 'crawl_job',
      entity_id: jobId,
      action: 'create',
      actor_type: 'tenant',
      result: 'success',
      new_values: { start_url: startUrl, pages_crawled: pagesCount },
      changes_summary: `Website crawled from ${startUrl} (${pagesCount} pages)`,
    });
  },

  async manualAdded(tenantId: string, kbId: string, sections: number) {
    return auditLog('kb_manual_added', {
      tenant_id: tenantId,
      event_type: 'kb_manual_added',
      entity_type: 'knowledge_base',
      entity_id: kbId,
      action: 'create',
      actor_type: 'tenant',
      result: 'success',
      new_values: { sections_count: sections, source_type: 'manual' },
      changes_summary: `Manual knowledge base entries added (${sections} sections)`,
    });
  },

  async deleted(tenantId: string, kbId: string) {
    return auditLog('kb_deleted', {
      tenant_id: tenantId,
      event_type: 'kb_deleted',
      entity_type: 'knowledge_base',
      entity_id: kbId,
      action: 'delete',
      actor_type: 'tenant',
      result: 'success',
      changes_summary: 'Knowledge base document deleted',
    });
  },
};

/**
 * Chat & Widget audit events
 */
export const ChatAudit = {
  async sessionCreated(tenantId: string, sessionId: string, visitorId: string) {
    return auditLog('chat_session_created', {
      tenant_id: tenantId,
      event_type: 'chat_session_created',
      entity_type: 'chat_session',
      entity_id: sessionId,
      action: 'create',
      actor_type: 'visitor',
      actor_id: visitorId,
      result: 'success',
      changes_summary: 'New chat session initiated',
    });
  },

  async messageReceived(tenantId: string, sessionId: string, messageLength: number) {
    return auditLog('chat_message_received', {
      tenant_id: tenantId,
      event_type: 'chat_message_received',
      entity_type: 'chat_session',
      entity_id: sessionId,
      action: 'create',
      actor_type: 'visitor',
      result: 'success',
      new_values: { message_length: messageLength },
    });
  },

  async responseSent(tenantId: string, sessionId: string, tokens: number) {
    return auditLog('chat_response_sent', {
      tenant_id: tenantId,
      event_type: 'chat_response_sent',
      entity_type: 'chat_session',
      entity_id: sessionId,
      action: 'create',
      actor_type: 'system',
      result: 'success',
      new_values: { tokens_used: tokens },
    });
  },

  async sessionEnded(tenantId: string, sessionId: string, duration: number) {
    return auditLog('chat_session_ended', {
      tenant_id: tenantId,
      event_type: 'chat_session_ended',
      entity_type: 'chat_session',
      entity_id: sessionId,
      action: 'delete',
      actor_type: 'system',
      result: 'success',
      new_values: { duration_seconds: duration },
    });
  },
};

/**
 * Branding & Configuration audit events
 */
export const ConfigAudit = {
  async brandingUpdated(tenantId: string, configId: string, changes: Record<string, any>) {
    const changesSummary = Object.entries(changes)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    return auditLog('branding_updated', {
      tenant_id: tenantId,
      event_type: 'branding_updated',
      entity_type: 'widget_config',
      entity_id: configId,
      action: 'update',
      actor_type: 'tenant',
      result: 'success',
      new_values: changes,
      changes_summary: `Branding settings updated: ${changesSummary}`,
    });
  },

  async toolsAssigned(tenantId: string, configId: string, tools: string[]) {
    return auditLog('tools_assigned', {
      tenant_id: tenantId,
      event_type: 'tools_assigned',
      entity_type: 'widget_config',
      entity_id: configId,
      action: 'update',
      actor_type: 'system',
      result: 'success',
      new_values: { assigned_tools: tools },
      changes_summary: `Tools assigned: ${tools.join(', ')}`,
    });
  },

  async widgetGenerated(tenantId: string, configId: string, widgetCode: string) {
    return auditLog('widget_generated', {
      tenant_id: tenantId,
      event_type: 'widget_generated',
      entity_type: 'widget_config',
      entity_id: configId,
      action: 'create',
      actor_type: 'system',
      result: 'success',
      new_values: { widget_code_length: widgetCode.length },
      changes_summary: 'Chat widget code generated',
    });
  },
};

/**
 * API & Error audit events
 */
export const ErrorAudit = {
  async apiError(
    tenantId: string | undefined,
    endpoint: string,
    statusCode: number,
    error: string,
    requestId?: string
  ) {
    return auditLog('api_error', {
      tenant_id: tenantId,
      event_type: 'api_error',
      entity_type: 'api_endpoint',
      action: 'error',
      result: 'failure',
      error_message: error,
      new_values: { endpoint, status_code: statusCode },
      request_id: requestId,
    });
  },

  async quotaExceeded(tenantId: string, quotaType: string, limit: number, used: number) {
    return auditLog('quota_exceeded', {
      tenant_id: tenantId,
      event_type: 'quota_exceeded',
      entity_type: 'usage_quota',
      action: 'access',
      result: 'failure',
      error_message: `Quota exceeded for ${quotaType}`,
      new_values: { quota_type: quotaType, limit, used, exceeded_by: used - limit },
      changes_summary: `${quotaType} quota exceeded (limit: ${limit}, used: ${used})`,
    });
  },

  async securityViolation(tenantId: string | undefined, violation: string, details?: Record<string, any>) {
    return auditLog('security_violation', {
      tenant_id: tenantId,
      event_type: 'security_violation',
      action: 'access',
      result: 'failure',
      error_message: violation,
      new_values: details,
      changes_summary: `Security violation: ${violation}`,
    });
  },
};

/**
 * Query audit events
 */
export async function getAuditEvents(
  tenantId: string | undefined,
  eventType?: string,
  startDate?: Date,
  endDate?: Date,
  limit: number = 100
) {
  try {
    let query = supabase.from('audit_events').select('*');

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    if (startDate) {
      query = query.gte('timestamp', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('timestamp', endDate.toISOString());
    }

    const { data, error } = await query.order('timestamp', { ascending: false }).limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get audit events:', error);
    throw error;
  }
}

/**
 * Get recent events for a tenant
 */
export async function getTenantAuditTrail(tenantId: string, days: number = 7, limit: number = 50) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return getAuditEvents(tenantId, undefined, startDate, undefined, limit);
}

/**
 * Get failed operations (for debugging)
 */
export async function getFailedOperations(tenantId?: string, days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    let query = supabase
      .from('audit_events')
      .select('*')
      .eq('result', 'failure')
      .gte('timestamp', startDate.toISOString());

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query.order('timestamp', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get failed operations:', error);
    throw error;
  }
}

/**
 * Get events for compliance/security investigation
 */
export async function getSecurityEvents(tenantId?: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    let query = supabase
      .from('audit_events')
      .select('*')
      .in('event_type', ['security_violation', 'quota_exceeded', 'unauthorized_access'])
      .gte('timestamp', startDate.toISOString());

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query.order('timestamp', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get security events:', error);
    throw error;
  }
}

/**
 * Generate audit report for a tenant
 */
export async function generateAuditReport(tenantId: string, startDate: Date, endDate: Date) {
  try {
    const events = await getAuditEvents(tenantId, undefined, startDate, endDate, 10000);

    const report = {
      tenant_id: tenantId,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      total_events: events.length,
      events_by_type: {} as Record<string, number>,
      events_by_action: {} as Record<string, number>,
      success_count: 0,
      failure_count: 0,
      events,
    };

    for (const event of events) {
      // Count by event type
      report.events_by_type[event.event_type] = (report.events_by_type[event.event_type] || 0) + 1;

      // Count by action
      if (event.action) {
        report.events_by_action[event.action] = (report.events_by_action[event.action] || 0) + 1;
      }

      // Count results
      if (event.result === 'success') {
        report.success_count++;
      } else if (event.result === 'failure') {
        report.failure_count++;
      }
    }

    return report;
  } catch (error) {
    console.error('Failed to generate audit report:', error);
    throw error;
  }
}

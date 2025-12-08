/**
 * Badge Audit Trail Logger
 * Tracks all security badge interactions for compliance verification
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../observability/logger';

export interface BadgeAuditEvent {
  badge_type: 'iso-27001' | 'soc2' | 'hipaa' | 'gdpr';
  interaction_type: 'viewed' | 'expanded' | 'verified' | 'shared';
  tenant_id: string;
  session_id: string;
  user_id?: string;
  details: Record<string, any>;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
}

export interface AuditTrailEntry {
  id: string;
  badge_type: string;
  interaction_type: string;
  tenant_id: string;
  session_id: string;
  timestamp: string;
  details: Record<string, any>;
  created_at: string;
}

export class BadgeAuditTrailLogger {
  private _supabase: ReturnType<typeof createClient> | null = null;

  private get supabase() {
    if (!this._supabase) {
      this._supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      );
    }
    return this._supabase;
  }

  /**
   * Log badge interaction event
   */
  async logBadgeInteraction(event: BadgeAuditEvent): Promise<void> {
    try {
      const { error } = await (this.supabase.from('badge_audit_trail') as any)
        .insert([
          {
            badge_type: event.badge_type,
            interaction_type: event.interaction_type,
            tenant_id: event.tenant_id,
            session_id: event.session_id,
            user_id: event.user_id,
            details: event.details,
            ip_address: event.ip_address,
            user_agent: event.user_agent,
            created_at: event.timestamp,
          },
        ]);

      if (error) {
        logger.error('[BadgeAuditTrail] Failed to log interaction', { error: (error as any).message });
        throw error;
      }

      logger.info('[BadgeAuditTrail] Interaction logged:', {
        badge_type: event.badge_type,
        interaction_type: event.interaction_type,
        tenant_id: event.tenant_id,
      });
    } catch (error) {
      logger.error('[BadgeAuditTrail] Error logging badge interaction', { error: error instanceof Error ? error.message : String(error) });
      // Don't throw - audit failures shouldn't break core functionality
    }
  }

  /**
   * Get audit trail for compliance verification
   */
  async getAuditTrail(
    tenant_id: string,
    filters?: {
      badge_type?: string;
      interaction_type?: string;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<AuditTrailEntry[]> {
    try {
      let query = (this.supabase.from('badge_audit_trail') as any)
        .select('*')
        .eq('tenant_id', tenant_id);

      if (filters?.badge_type) {
        query = query.eq('badge_type', filters.badge_type);
      }

      if (filters?.interaction_type) {
        query = query.eq('interaction_type', filters.interaction_type);
      }

      if (filters?.start_date) {
        query = query.gte('created_at', filters.start_date);
      }

      if (filters?.end_date) {
        query = query.lte('created_at', filters.end_date);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      });

      if (error) {
        logger.error('[BadgeAuditTrail] Failed to fetch audit trail', { error: (error as any).message });
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('[BadgeAuditTrail] Error fetching audit trail', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Get audit statistics for compliance reporting
   */
  async getAuditStats(tenant_id: string): Promise<{
    total_interactions: number;
    by_badge_type: Record<string, number>;
    by_interaction_type: Record<string, number>;
    last_verification: string | null;
  }> {
    try {
      const trail = await this.getAuditTrail(tenant_id);

      const by_badge_type: Record<string, number> = {};
      const by_interaction_type: Record<string, number> = {};

      trail.forEach((entry) => {
        by_badge_type[entry.badge_type] =
          (by_badge_type[entry.badge_type] || 0) + 1;
        by_interaction_type[entry.interaction_type] =
          (by_interaction_type[entry.interaction_type] || 0) + 1;
      });

      const verifications = trail.filter(
        (e) => e.interaction_type === 'verified'
      );

      return {
        total_interactions: trail.length,
        by_badge_type,
        by_interaction_type,
        last_verification:
          verifications.length > 0 ? verifications[0].created_at : null,
      };
    } catch (error) {
      logger.error('[BadgeAuditTrail] Error getting audit stats', { error: error instanceof Error ? error.message : String(error) });
      return {
        total_interactions: 0,
        by_badge_type: {},
        by_interaction_type: {},
        last_verification: null,
      };
    }
  }

  /**
   * Export audit trail for compliance documentation
   */
  async exportAuditTrail(tenant_id: string): Promise<string> {
    try {
      const trail = await this.getAuditTrail(tenant_id);
      const stats = await this.getAuditStats(tenant_id);

      const report = {
        tenant_id,
        export_date: new Date().toISOString(),
        summary: stats,
        entries: trail,
      };

      return JSON.stringify(report, null, 2);
    } catch (error) {
      logger.error('[BadgeAuditTrail] Error exporting audit trail', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

export const badgeAuditTrailLogger = new BadgeAuditTrailLogger();

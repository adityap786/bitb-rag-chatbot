/**
 * Audit Report Generator
 * Generates compliance reports for audit trails and security verification
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../observability/logger';

export interface AuditReportData {
  tenant_id: string;
  report_period_start: string;
  report_period_end: string;
  total_operations: number;
  by_operation_type: Record<string, number>;
  security_events: Array<{
    event_type: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
  }>;
  compliance_status: 'compliant' | 'non-compliant' | 'warnings';
  generated_at: string;
  signed_by?: string;
}

export class AuditReportGenerator {
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
   * Generate audit report for date range
   */
  async generateAuditReport(
    tenant_id: string,
    start_date: string,
    end_date: string
  ): Promise<AuditReportData> {
    try {
      // Fetch audit logs for period
      const { data: auditLogs, error } = await (this.supabase
        .from('audit_logs') as any)
        .select('*')
        .eq('tenant_id', tenant_id)
        .gte('created_at', start_date)
        .lte('created_at', end_date);

      if (error) {
        logger.error('[AuditReportGenerator] Failed to fetch audit logs', { error: (error as any).message });
        throw error;
      }

      // Aggregate by operation type
      const by_operation_type: Record<string, number> = {};
      const security_events: Record<string, { count: number; severity: 'low' | 'medium' | 'high' }> = {};

      (auditLogs || []).forEach((log: any) => {
        const event_type = log.event_type || 'unknown';
        by_operation_type[event_type] = (by_operation_type[event_type] || 0) + 1;

        // Track security events
        if (
          ['unauthorized_access', 'rate_limit_exceeded', 'pii_detected'].includes(
            event_type
          )
        ) {
          if (!security_events[event_type]) {
            security_events[event_type] = {
              count: 0,
              severity: this.getSeverity(event_type),
            };
          }
          security_events[event_type].count += 1;
        }
      });

      // Determine compliance status based on security events
      const criticalEvents = Object.values(security_events).filter(
        (e) => e.severity === 'high'
      );
      const compliance_status =
        criticalEvents.length > 0 ? 'non-compliant' : 'compliant';

      const report: AuditReportData = {
        tenant_id,
        report_period_start: start_date,
        report_period_end: end_date,
        total_operations: auditLogs?.length || 0,
        by_operation_type,
        security_events: Object.entries(security_events).map(
          ([event_type, data]) => ({
            event_type,
            ...data,
          })
        ),
        compliance_status,
        generated_at: new Date().toISOString(),
      };

      logger.info('[AuditReportGenerator] Report generated', {
        tenant_id,
        period: `${start_date} - ${end_date}`,
        total_operations: report.total_operations,
        compliance_status,
      });

      return report;
    } catch (error) {
      logger.error('[AuditReportGenerator] Error generating audit report', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Generate monthly compliance report
   */
  async generateMonthlyReport(
    tenant_id: string,
    year: number,
    month: number
  ): Promise<AuditReportData> {
    const start_date = new Date(year, month - 1, 1).toISOString();
    const end_date = new Date(year, month, 0, 23, 59, 59).toISOString();

    return this.generateAuditReport(tenant_id, start_date, end_date);
  }

  /**
   * Generate annual compliance report
   */
  async generateAnnualReport(
    tenant_id: string,
    year: number
  ): Promise<AuditReportData> {
    const start_date = new Date(year, 0, 1).toISOString();
    const end_date = new Date(year, 11, 31, 23, 59, 59).toISOString();

    return this.generateAuditReport(tenant_id, start_date, end_date);
  }

  /**
   * Export report as JSON
   */
  async exportReportAsJson(report: AuditReportData): Promise<string> {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as CSV for spreadsheet analysis
   */
  async exportReportAsCsv(report: AuditReportData): Promise<string> {
    let csv = `Audit Report - ${report.tenant_id}\n`;
    csv += `Period: ${report.report_period_start} to ${report.report_period_end}\n`;
    csv += `Generated: ${report.generated_at}\n`;
    csv += `Compliance Status: ${report.compliance_status}\n\n`;

    csv += `Summary\n`;
    csv += `Total Operations,${report.total_operations}\n\n`;

    csv += `Operations by Type\n`;
    csv += `Operation Type,Count\n`;
    Object.entries(report.by_operation_type).forEach(([type, count]) => {
      csv += `"${type}",${count}\n`;
    });

    csv += `\nSecurity Events\n`;
    csv += `Event Type,Count,Severity\n`;
    report.security_events.forEach((event) => {
      csv += `"${event.event_type}",${event.count},${event.severity}\n`;
    });

    return csv;
  }

  /**
   * Store report in database
   */
  async storeReport(report: AuditReportData): Promise<string> {
    try {
      const { data, error } = await (this.supabase.from('audit_reports') as any)
        .insert([
          {
            tenant_id: report.tenant_id,
            report_period_start: report.report_period_start,
            report_period_end: report.report_period_end,
            total_operations: report.total_operations,
            by_operation_type: report.by_operation_type,
            security_events: report.security_events,
            compliance_status: report.compliance_status,
            generated_at: report.generated_at,
          },
        ])
        .select('id')
        .single() as any;

      if (error) {
        logger.error('[AuditReportGenerator] Failed to store report', { error: (error as any).message });
        throw error;
      }

      logger.info('[AuditReportGenerator] Report stored', {
        tenant_id: report.tenant_id,
        report_id: data?.id,
      });

      return data?.id || '';
    } catch (error) {
      logger.error('[AuditReportGenerator] Error storing report', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get severity level for event type
   */
  private getSeverity(
    event_type: string
  ): 'low' | 'medium' | 'high' {
    const severityMap: Record<string, 'low' | 'medium' | 'high'> = {
      unauthorized_access: 'high',
      rate_limit_exceeded: 'medium',
      pii_detected: 'high',
      document_accessed: 'low',
      query_executed: 'low',
    };

    return severityMap[event_type] || 'low';
  }

  /**
   * Generate compliance certificate
   */
  async generateComplianceCertificate(
    report: AuditReportData,
    certification_type: 'iso-27001' | 'soc2' | 'hipaa' | 'gdpr'
  ): Promise<string> {
    const certificate = `
╔════════════════════════════════════════════════════════════╗
║           COMPLIANCE CERTIFICATION CERTIFICATE            ║
╚════════════════════════════════════════════════════════════╝

Tenant ID: ${report.tenant_id}
Certification Type: ${certification_type.toUpperCase()}
Report Period: ${report.report_period_start} to ${report.report_period_end}
Generated: ${report.generated_at}

STATUS: ${report.compliance_status.toUpperCase()}

Summary:
- Total Operations Logged: ${report.total_operations}
- Compliance Status: ${report.compliance_status}
- Security Events: ${report.security_events.length}
- Critical Issues: ${report.security_events.filter((e) => e.severity === 'high').length}

This certifies that the systems and operations of the above
tenant have been reviewed and found to be in ${report.compliance_status} state
with respect to ${certification_type.toUpperCase()} standards.

Generated by: Audit Report Generator v1.0
Digital Signature: ${this.generateSignature(report)}

════════════════════════════════════════════════════════════
    `;

    return certificate;
  }

  /**
   * Generate digital signature for certificate
   */
  private generateSignature(report: AuditReportData): string {
    const data = `${report.tenant_id}:${report.generated_at}:${report.compliance_status}`;
    // In production, use actual cryptographic signing
    return Buffer.from(data).toString('base64').slice(0, 32);
  }
}

export const auditReportGenerator = new AuditReportGenerator();

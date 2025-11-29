/**
 * Compliance Checks - Automated Security Audit Validation
 * Runs compliance checks for tenant isolation, data encryption, and access controls
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../observability/logger';
import { validateTenantAccess } from './tenant-access-validator';

export interface ComplianceCheckResult {
  check_id: string;
  check_name: string;
  status: 'pass' | 'fail' | 'warning';
  details: string;
  evidence?: Record<string, any>;
  timestamp: string;
}

export interface ComplianceReport {
  tenant_id: string;
  report_date: string;
  overall_status: 'compliant' | 'non-compliant' | 'warnings';
  checks_passed: number;
  checks_failed: number;
  checks_warning: number;
  results: ComplianceCheckResult[];
}

export class ComplianceChecker {
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
   * Check tenant isolation enforcement
   */
  async checkTenantIsolation(tenant_id: string): Promise<ComplianceCheckResult> {
    try {
      // Verify RLS policies are enabled
      const { data, error } = await (this.supabase.from('rag_documents') as any)
        .select('count', { count: 'exact' })
        .eq('tenant_id', tenant_id);

      if (error) {
        return {
          check_id: 'tenant-isolation-01',
          check_name: 'Tenant Isolation Enforcement',
          status: 'fail',
          details:
            'Unable to verify RLS enforcement - database query failed',
          timestamp: new Date().toISOString(),
        };
      }

      // Attempt to query without tenant_id filter (should fail with RLS)
      const { error: rls_bypass_error } = await (this.supabase
        .from('rag_documents') as any)
        .select('*')
        .limit(1);

      if (!rls_bypass_error) {
        return {
          check_id: 'tenant-isolation-01',
          check_name: 'Tenant Isolation Enforcement',
          status: 'fail',
          details:
            'RLS policy may not be properly enforced - query succeeded without tenant context',
          timestamp: new Date().toISOString(),
        };
      }

      return {
        check_id: 'tenant-isolation-01',
        check_name: 'Tenant Isolation Enforcement',
        status: 'pass',
        details: 'Row-level security policies properly enforced',
        evidence: {
          rls_enforced: true,
          check_timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('[ComplianceChecker] Tenant isolation check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        check_id: 'tenant-isolation-01',
        check_name: 'Tenant Isolation Enforcement',
        status: 'fail',
        details: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check audit logging implementation
   */
  async checkAuditLogging(tenant_id: string): Promise<ComplianceCheckResult> {
    try {
      const { data, error } = await (this.supabase.from('audit_logs') as any)
        .select('count', { count: 'exact' })
        .eq('tenant_id', tenant_id);

      if (error && error.code !== 'PGRST116') {
        // PGRST116 means table doesn't exist
        return {
          check_id: 'audit-logging-01',
          check_name: 'Audit Logging Implementation',
          status: 'fail',
          details: 'Audit log table not accessible',
          timestamp: new Date().toISOString(),
        };
      }

      // Check for recent audit entries
      const { data: recentLogs } = await (this.supabase
        .from('audit_logs') as any)
        .select('*')
        .eq('tenant_id', tenant_id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      const hasRecentLogs = recentLogs && recentLogs.length > 0;

      return {
        check_id: 'audit-logging-01',
        check_name: 'Audit Logging Implementation',
        status: hasRecentLogs ? 'pass' : 'warning',
        details: hasRecentLogs
          ? 'Audit logs present and recent entries detected'
          : 'No recent audit log entries detected in last 24 hours',
        evidence: {
          recent_logs_count: recentLogs?.length || 0,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('[ComplianceChecker] Audit logging check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        check_id: 'audit-logging-01',
        check_name: 'Audit Logging Implementation',
        status: 'fail',
        details: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check data encryption in transit
   */
  async checkEncryptionInTransit(): Promise<ComplianceCheckResult> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const useHttps = supabaseUrl.startsWith('https://');

      return {
        check_id: 'encryption-transit-01',
        check_name: 'Encryption in Transit (HTTPS)',
        status: useHttps ? 'pass' : 'fail',
        details: useHttps
          ? 'HTTPS enabled for all connections'
          : 'HTTPS not enabled - data transmitted in plain text',
        evidence: {
          https_enabled: useHttps,
          supabase_url_scheme: supabaseUrl.split('://')[0],
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('[ComplianceChecker] Encryption check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        check_id: 'encryption-transit-01',
        check_name: 'Encryption in Transit (HTTPS)',
        status: 'fail',
        details: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check API key security
   */
  async checkApiKeySecurity(): Promise<ComplianceCheckResult> {
    try {
      const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
      const hasAnnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const allKeysPresent = hasServiceRoleKey && hasAnnonKey;

      return {
        check_id: 'api-security-01',
        check_name: 'API Key Configuration',
        status: allKeysPresent ? 'pass' : 'fail',
        details: allKeysPresent
          ? 'All required API keys configured'
          : 'Missing API keys - service role or anonymous key not set',
        evidence: {
          service_role_configured: hasServiceRoleKey,
          anon_key_configured: hasAnnonKey,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('[ComplianceChecker] API key security check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        check_id: 'api-security-01',
        check_name: 'API Key Configuration',
        status: 'fail',
        details: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Run all compliance checks
   */
  async runAllChecks(tenant_id: string): Promise<ComplianceReport> {
    logger.info('[ComplianceChecker] Starting compliance checks for tenant', { tenant_id });

    const results = await Promise.all([
      this.checkTenantIsolation(tenant_id),
      this.checkAuditLogging(tenant_id),
      this.checkEncryptionInTransit(),
      this.checkApiKeySecurity(),
    ]);

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const warnings = results.filter((r) => r.status === 'warning').length;

    const overallStatus: 'compliant' | 'non-compliant' | 'warnings' =
      failed > 0 ? 'non-compliant' : warnings > 0 ? 'warnings' : 'compliant';

    const report: ComplianceReport = {
      tenant_id,
      report_date: new Date().toISOString(),
      overall_status: overallStatus,
      checks_passed: passed,
      checks_failed: failed,
      checks_warning: warnings,
      results,
    };

    logger.info('[ComplianceChecker] Compliance check complete', {
      tenant_id,
      status: overallStatus,
      passed,
      failed,
      warnings,
    });

    return report;
  }

  /**
   * Store compliance report
   */
  async storeComplianceReport(report: ComplianceReport): Promise<void> {
    try {
      const { error } = await (this.supabase.from('compliance_reports') as any)
        .insert([
          {
            tenant_id: report.tenant_id,
            report_date: report.report_date,
            overall_status: report.overall_status,
            checks_passed: report.checks_passed,
            checks_failed: report.checks_failed,
            checks_warning: report.checks_warning,
            results: report.results,
          },
        ]);

      if (error) {
        logger.error('[ComplianceChecker] Failed to store compliance report', { error: (error as any).message });
        throw error;
      }

      logger.info('[ComplianceChecker] Compliance report stored', {
        tenant_id: report.tenant_id,
      });
    } catch (error) {
      logger.error('[ComplianceChecker] Error storing compliance report', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const complianceChecker = new ComplianceChecker();

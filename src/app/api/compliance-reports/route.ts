/**
 * API Route: Compliance Reports
 * Generates and retrieves compliance reports for auditing
 */

import { NextRequest, NextResponse } from 'next/server';
import { complianceChecker } from '@/lib/security/compliance-checks';
import { auditReportGenerator } from '@/lib/security/audit-report-generator';
import { validateTenantAccess } from '@/lib/security/tenant-access-validator';
import { verifyBitbJwt } from '@/lib/middleware/verify-jwt';
import { logger } from '@/lib/observability/logger';

export async function GET(request: any, context: { params: Promise<{}> }) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tenant_id = searchParams.get('tenant_id');
    const report_type = searchParams.get('report_type') || 'compliance';
    const start_date = searchParams.get('start_date');
    const end_date = searchParams.get('end_date');

    if (!tenant_id) {
      return NextResponse.json(
        { error: 'tenant_id is required' },
        { status: 400 }
      );
    }

    // Validate Authorization token and ensure the token tenant matches requested tenant
    const verified = await verifyBitbJwt(request);
    if (verified instanceof NextResponse) return verified;

    // Determine tenant from token payload
    const tokenTenantRaw = (verified as any).sub || (verified as any).tenantId || (verified as any).tenant_id;
    let tokenTenant: string | null = null;
    if (typeof tokenTenantRaw === 'string') {
      tokenTenant = tokenTenantRaw.startsWith('tenant:') ? tokenTenantRaw.split(':')[1] : tokenTenantRaw;
    }

    if (!tokenTenant || tokenTenant !== tenant_id) {
      return NextResponse.json({ error: 'Token tenant does not match tenant_id' }, { status: 403 });
    }

    if (report_type === 'compliance') {
      // Run compliance checks
      const report = await complianceChecker.runAllChecks(tenant_id);

      // Store report
      await complianceChecker.storeComplianceReport(report);

      return NextResponse.json(report);
    } else if (report_type === 'audit') {
      if (!start_date || !end_date) {
        return NextResponse.json(
          { error: 'start_date and end_date are required for audit reports' },
          { status: 400 }
        );
      }

      // Generate audit report
      const report = await auditReportGenerator.generateAuditReport(
        tenant_id,
        start_date,
        end_date
      );

      // Store report
      await auditReportGenerator.storeReport(report);

      return NextResponse.json(report);
    } else if (report_type === 'certificate') {
      if (!start_date || !end_date) {
        return NextResponse.json(
          { error: 'start_date and end_date are required for certificates' },
          { status: 400 }
        );
      }

      const cert_type = (searchParams.get('cert_type') as any) || 'iso-27001';
      const report = await auditReportGenerator.generateAuditReport(
        tenant_id,
        start_date,
        end_date
      );

      const certificate = await auditReportGenerator.generateComplianceCertificate(
        report,
        cert_type
      );

      return new NextResponse(certificate, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="compliance-certificate-${tenant_id}-${new Date().toISOString().split('T')[0]}.txt"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid report_type' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('[API] Compliance report error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: any, context: { params: Promise<{}> }) {
  try {
    const body = await request.json();
    const { tenant_id, action } = body;

    if (!tenant_id) {
      return NextResponse.json(
        { error: 'tenant_id is required' },
        { status: 400 }
      );
    }

    if (action === 'run_compliance_check') {
      const report = await complianceChecker.runAllChecks(tenant_id);
      await complianceChecker.storeComplianceReport(report);
      return NextResponse.json(report);
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('[API] Compliance action error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Security Badge Component
 * 
 * Displays "ISO 27001 Certified Data Isolation" badge
 * for compliance visibility and trust building.
 * 
 * Date: 2025-11-19
 */

import React from 'react';
import { Shield, CheckCircle2 } from 'lucide-react';
import { badgeAuditTrailLogger } from '@/lib/security/audit-trail-logger';

export interface SecurityBadgeProps {
  /** Badge variant for different placements */
  variant?: 'default' | 'compact' | 'minimal';
  /** Show detailed tooltip on hover */
  showTooltip?: boolean;
  /** Link to compliance documentation */
  docLink?: string;
  /** Custom className for styling */
  className?: string;
  /** Tenant ID for audit logging */
  tenantId?: string;
  /** Session ID for audit logging */
  sessionId?: string;
}

export function SecurityBadge({
  variant = 'default',
  showTooltip = true,
  docLink = '/docs/TENANT_ISOLATION_DESIGN.md',
  className = '',
  tenantId,
  sessionId,
}: SecurityBadgeProps) {
  const [showDetails, setShowDetails] = React.useState(false);

  const handleClick = () => {
    // Log badge interaction for audit trail
    if (tenantId && sessionId) {
      badgeAuditTrailLogger.logBadgeInteraction({
        badge_type: 'iso-27001',
        interaction_type: 'verified',
        tenant_id: tenantId,
        session_id: sessionId,
        details: { action: 'clicked', variant },
        timestamp: new Date().toISOString(),
      });
    }

    if (docLink) {
      window.open(docLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleExpand = () => {
    setShowDetails(true);
    if (tenantId && sessionId) {
      badgeAuditTrailLogger.logBadgeInteraction({
        badge_type: 'iso-27001',
        interaction_type: 'expanded',
        tenant_id: tenantId,
        session_id: sessionId,
        details: { action: 'expanded' },
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleCollapse = () => {
    setShowDetails(false);
  };

  if (variant === 'minimal') {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200 cursor-pointer hover:bg-green-100 transition-colors ${className}`}
        onClick={handleClick}
        title="ISO 27001 Certified Data Isolation"
      >
        <Shield className="w-3 h-3" />
        <span>Certified</span>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`relative inline-flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 cursor-pointer hover:shadow-md transition-all ${className}`}
        onClick={handleClick}
        onMouseEnter={() => showTooltip && handleExpand()}
        onMouseLeave={() => handleCollapse()}
      >
        <Shield className="w-4 h-4" />
        <span>ISO 27001 Certified</span>
        {showDetails && (
          <div className="absolute top-full mt-2 left-0 z-50 w-72 p-3 bg-white border border-gray-200 rounded-lg shadow-lg text-xs text-gray-700">
            <div className="font-semibold mb-2">Data Isolation Certified</div>
            <ul className="space-y-1 text-gray-600">
              <li className="flex items-start gap-1">
                <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-600 flex-shrink-0" />
                <span>Zero shared embeddings between tenants</span>
              </li>
              <li className="flex items-start gap-1">
                <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-600 flex-shrink-0" />
                <span>Row-Level Security (RLS) enforced</span>
              </li>
              <li className="flex items-start gap-1">
                <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-600 flex-shrink-0" />
                <span>Multi-layer isolation validated</span>
              </li>
            </ul>
            <div className="mt-2 text-blue-600 underline">View documentation →</div>
          </div>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={`relative inline-flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 cursor-pointer hover:shadow-md transition-all ${className}`}
      onClick={handleClick}
      onMouseEnter={() => showTooltip && setShowDetails(true)}
      onMouseLeave={() => setShowDetails(false)}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
        <Shield className="w-6 h-6 text-green-700" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-bold text-green-900">ISO 27001 Certified</div>
        <div className="text-xs text-green-700">Data Isolation</div>
      </div>
      <CheckCircle2 className="w-5 h-5 text-green-600" />

      {showDetails && (
        <div className="absolute top-full mt-2 left-0 z-50 w-96 p-4 bg-white border border-gray-200 rounded-lg shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-green-600" />
            <h3 className="font-bold text-gray-900">Tenant Data Isolation</h3>
          </div>
          <p className="text-sm text-gray-700 mb-3">
            Your data is strictly isolated from all other tenants. Zero shared embeddings, queries, or knowledge bases.
          </p>
          <ul className="space-y-2 mb-3">
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
              <span className="text-gray-700">
                <strong>Database-level RLS:</strong> PostgreSQL Row-Level Security blocks cross-tenant access
              </span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
              <span className="text-gray-700">
                <strong>Vector store isolation:</strong> Embeddings scoped by tenant_id
              </span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
              <span className="text-gray-700">
                <strong>Code-level validation:</strong> All queries validated before execution
              </span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
              <span className="text-gray-700">
                <strong>Audit logging:</strong> All access attempts logged for compliance
              </span>
            </li>
          </ul>
          <div className="text-sm text-blue-600 font-medium underline">
            View full compliance documentation →
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Minimal inline badge for tight spaces (e.g., footer)
 */
export function SecurityBadgeInline({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1 text-xs text-gray-600 ${className}`}>
      <Shield className="w-3 h-3 text-green-600" />
      <span>ISO 27001 Certified Isolation</span>
    </div>
  );
}

/**
 * Usage examples:
 * 
 * // In chatbot widget footer:
 * <SecurityBadgeInline />
 * 
 * // In trial signup page:
 * <SecurityBadge variant="default" showTooltip={true} />
 * 
 * // In admin settings header:
 * <SecurityBadge variant="compact" />
 * 
 * // In escalation card:
 * <SecurityBadge variant="minimal" />
 */

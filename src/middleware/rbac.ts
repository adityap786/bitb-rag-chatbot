/**
 * Enhanced RBAC Middleware
 * 
 * Production-grade role-based access control for Next.js API routes.
 * Integrates with the permissions system for granular authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  Permission,
  Role,
  AuthContext,
  createAuthContext,
  authorize,
  authorizeRole,
  authorizeAll,
  authorizeAny,
  logPermissionCheck,
} from '@/lib/security/permissions';
import { verifyAccessToken, AdminJWTPayload } from '@/lib/auth/admin-auth';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/observability/logger';

// ============================================================
// Request Context Extraction
// ============================================================

/**
 * Extract auth context from request
 */
export async function extractAuthContext(
  req: NextRequest | Request
): Promise<AuthContext | null> {
  try {
    // Try JWT token first
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);

      if (payload) {
        return createAuthContext(
          payload.sub,
          payload.role as Role,
          undefined, // tenant extracted separately
          payload.email
        );
      }
    }

    // Try session cookie
    const sessionToken = req.headers.get('x-session-token');
    if (sessionToken) {
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: { user }, error } = await supabase.auth.getUser(sessionToken);
      if (!error && user) {
        // Get role from user metadata or default
        const role = (user.user_metadata?.role as Role) || 'viewer';
        return createAuthContext(user.id, role, undefined, user.email);
      }
    }

    return null;
  } catch (error) {
    logger.error('Failed to extract auth context', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Extract tenant context from request
 */
export async function extractTenantContext(
  req: NextRequest | Request,
  authContext: AuthContext
): Promise<{ tenantId: string; role: Role } | null> {
  try {
    // Check header
    let tenantId = req.headers.get('x-tenant-id');

    // Check query params
    if (!tenantId && req instanceof NextRequest) {
      tenantId = new URL(req.url).searchParams.get('tenant_id');
    }

    // Check body for POST requests
    if (!tenantId && req.method === 'POST') {
      try {
        const body = await (req as NextRequest).clone().json();
        tenantId = body.tenant_id;
      } catch {
        // Body not JSON or parsing failed
      }
    }

    if (!tenantId) return null;

    // Verify user has access to this tenant
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', authContext.userId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      // Super admins can access any tenant
      if (authContext.role === 'super_admin') {
        return { tenantId, role: 'super_admin' };
      }
      return null;
    }

    return { tenantId, role: data.role as Role };
  } catch (error) {
    logger.error('Failed to extract tenant context', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ============================================================
// Middleware Factory Functions
// ============================================================

export interface RBACOptions {
  /** Required permission(s) - all must be present */
  permissions?: Permission[];
  /** Alternative permissions - any one sufficient */
  anyPermission?: Permission[];
  /** Minimum role required */
  minRole?: Role;
  /** Require tenant context */
  requireTenant?: boolean;
  /** Allow public access (for optional auth) */
  allowPublic?: boolean;
}

/**
 * Create RBAC middleware for API route handlers
 */
export function withRBAC(options: RBACOptions = {}) {
  return async function rbacMiddleware(
    req: NextRequest | Request,
    handler: (req: NextRequest | Request, context: AuthContext) => Promise<Response>
  ): Promise<Response> {
    const requestInfo = {
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    };

    // Extract auth context
    const authContext = await extractAuthContext(req);

    if (!authContext) {
      if (options.allowPublic) {
        // Create anonymous context
        const anonContext = createAuthContext('anonymous', 'viewer');
        return handler(req, anonContext);
      }

      logger.warn('Authentication required', {
        path: req.url,
        ...requestInfo,
      });

      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    // Extract tenant context if required
    if (options.requireTenant) {
      const tenantContext = await extractTenantContext(req, authContext);
      if (!tenantContext) {
        logger.warn('Tenant access denied', {
          userId: authContext.userId,
          path: req.url,
          ...requestInfo,
        });

        return NextResponse.json(
          { error: 'Tenant access required', code: 'TENANT_REQUIRED' },
          { status: 403 }
        );
      }

      // Update context with tenant info
      authContext.tenantId = tenantContext.tenantId;
      // Use tenant-specific role (may be different from global role)
      authContext.role = tenantContext.role;
    }

    // Check minimum role
    if (options.minRole) {
      const result = authorizeRole(authContext, options.minRole);
      if (!result.allowed) {
        logPermissionCheck(authContext, 'role_check', result, undefined, requestInfo);

        return NextResponse.json(
          {
            error: result.reason,
            code: 'INSUFFICIENT_ROLE',
            requiredRole: options.minRole,
            userRole: authContext.role,
          },
          { status: 403 }
        );
      }
    }

    // Check required permissions (all must be present)
    if (options.permissions && options.permissions.length > 0) {
      const result = authorizeAll(authContext, options.permissions);
      if (!result.allowed) {
        logPermissionCheck(authContext, 'permission_check', result, undefined, requestInfo);

        return NextResponse.json(
          {
            error: result.reason,
            code: 'MISSING_PERMISSION',
            requiredPermissions: options.permissions,
          },
          { status: 403 }
        );
      }
    }

    // Check alternative permissions (any one sufficient)
    if (options.anyPermission && options.anyPermission.length > 0) {
      const result = authorizeAny(authContext, options.anyPermission);
      if (!result.allowed) {
        logPermissionCheck(authContext, 'permission_check_any', result, undefined, requestInfo);

        return NextResponse.json(
          {
            error: result.reason,
            code: 'MISSING_PERMISSION',
            requiredAnyOf: options.anyPermission,
          },
          { status: 403 }
        );
      }
    }

    // All checks passed
    logger.info('RBAC authorization passed', {
      userId: authContext.userId,
      tenantId: authContext.tenantId,
      role: authContext.role,
      path: req.url,
    });

    return handler(req, authContext);
  };
}

// ============================================================
// Convenience Middleware Creators
// ============================================================

/**
 * Require authenticated user (any role)
 */
export function requireAuth() {
  return withRBAC({});
}

/**
 * Require specific role
 */
export function requireRole(role: Role) {
  return withRBAC({ minRole: role });
}

/**
 * Require specific permission
 */
export function requirePermission(permission: Permission) {
  return withRBAC({ permissions: [permission] });
}

/**
 * Require tenant admin or higher
 */
export function requireTenantAdmin() {
  return withRBAC({ requireTenant: true, minRole: 'admin' });
}

/**
 * Require super admin
 */
export function requireSuperAdmin() {
  return withRBAC({ minRole: 'super_admin' });
}

// ============================================================
// API Route Helper
// ============================================================

/**
 * Wrap an API route handler with RBAC checks
 * 
 * @example
 * ```typescript
 * export const POST = protectedRoute(
 *   { permissions: ['documents:write'], requireTenant: true },
 *   async (req, context) => {
 *     // Handler has access to authenticated context
 *     return NextResponse.json({ success: true });
 *   }
 * );
 * ```
 */
export function protectedRoute(
  options: RBACOptions,
  handler: (req: NextRequest | Request, context: AuthContext) => Promise<Response>
) {
  const middleware = withRBAC(options);

  return async (req: NextRequest | Request) => {
    return middleware(req, handler);
  };
}

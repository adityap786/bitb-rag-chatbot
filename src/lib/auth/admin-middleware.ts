/**
 * Admin Authentication Middleware
 * Protects admin routes with JWT authentication and role-based access control
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getAdminUser, type AdminJWTPayload } from './admin-auth';
import { logger } from '../observability/logger';

export interface AdminAuthContext {
  user: {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'viewer';
  };
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify admin authentication and return user context
 */
export async function verifyAdminAuth(request: NextRequest): Promise<AdminAuthContext | null> {
  const token = extractBearerToken(request);
  
  if (!token) {
    logger.warn('Admin auth failed: missing token', {
      path: request.nextUrl.pathname,
    });
    return null;
  }

  // Verify JWT
  const decoded = verifyAccessToken(token);
  if (!decoded) {
    logger.warn('Admin auth failed: invalid token', {
      path: request.nextUrl.pathname,
    });
    return null;
  }

  // Get user from database to ensure they're still active
  const user = await getAdminUser(decoded.sub);
  if (!user) {
    logger.warn('Admin auth failed: user not found or inactive', {
      userId: decoded.sub,
      path: request.nextUrl.pathname,
    });
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Middleware to protect admin routes
 * Returns error response if authentication fails, null if authentication succeeds
 */
export async function requireAdminAuth(
  request: NextRequest,
  requiredRole?: 'super_admin' | 'admin' | 'viewer'
): Promise<NextResponse | null> {
  const authContext = await verifyAdminAuth(request);

  if (!authContext) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'ADMIN_AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  // Check role if specified
  if (requiredRole) {
    const roleHierarchy = {
      super_admin: 3,
      admin: 2,
      viewer: 1,
    };

    const userRoleLevel = roleHierarchy[authContext.user.role];
    const requiredRoleLevel = roleHierarchy[requiredRole];

    if (userRoleLevel < requiredRoleLevel) {
      logger.warn('Admin auth failed: insufficient permissions', {
        userId: authContext.user.id,
        userRole: authContext.user.role,
        requiredRole,
        path: request.nextUrl.pathname,
      });
      return NextResponse.json(
        { error: 'Forbidden', code: 'INSUFFICIENT_PERMISSIONS' },
        { status: 403 }
      );
    }
  }

  // Authentication successful, return null (no error)
  return null;
}

/**
 * Middleware to require super admin role
 */
export async function requireSuperAdmin(request: NextRequest): Promise<NextResponse | null> {
  return requireAdminAuth(request, 'super_admin');
}

/**
 * Middleware to require admin or super admin role
 */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  return requireAdminAuth(request, 'admin');
}

/**
 * Middleware to require any authenticated admin (including viewer)
 */
export async function requireAnyAdmin(request: NextRequest): Promise<NextResponse | null> {
  return requireAdminAuth(request, 'viewer');
}

/**
 * Get admin context from request (assumes middleware has already verified auth)
 */
export async function getAdminContext(request: NextRequest): Promise<AdminAuthContext | null> {
  return verifyAdminAuth(request);
}

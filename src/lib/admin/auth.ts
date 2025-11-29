/**
 * Admin Authentication Module
 * 
 * Production-grade admin authentication with:
 * - JWT-based authentication
 * - Role-based access control (RBAC)
 * - Session management
 * - Audit logging
 * - Rate limiting
 */

import { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import crypto from 'crypto';
import { logger } from '../observability/logger';
import { redis } from '../redis-client';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'viewer';

export interface AdminUser {
  admin_id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: string[];
  created_at: string;
  last_login_at?: string;
  mfa_enabled: boolean;
}

export interface AdminSession {
  session_id: string;
  admin_id: string;
  email: string;
  role: AdminRole;
  permissions: string[];
  ip_address: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
}

export interface AuthResult {
  authenticated: boolean;
  adminId?: string;
  email?: string;
  role?: AdminRole;
  permissions?: string[];
  error?: string;
}

// ============================================================================
// Role Permissions
// ============================================================================

const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: [
    'tenants:read',
    'tenants:create',
    'tenants:update',
    'tenants:delete',
    'tenants:suspend',
    'users:read',
    'users:create',
    'users:update',
    'users:delete',
    'analytics:read',
    'analytics:export',
    'workflows:read',
    'workflows:manage',
    'settings:read',
    'settings:update',
    'audit:read',
    'billing:read',
    'billing:manage',
  ],
  admin: [
    'tenants:read',
    'tenants:create',
    'tenants:update',
    'tenants:suspend',
    'users:read',
    'analytics:read',
    'analytics:export',
    'workflows:read',
    'workflows:manage',
    'settings:read',
    'audit:read',
    'billing:read',
  ],
  support: [
    'tenants:read',
    'users:read',
    'analytics:read',
    'workflows:read',
    'audit:read',
  ],
  viewer: [
    'tenants:read',
    'analytics:read',
  ],
};

// ============================================================================
// JWT Configuration
// ============================================================================

const JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'fallback-secret-change-in-production'
);
const JWT_ISSUER = 'bitb-admin';
const JWT_AUDIENCE = 'bitb-admin-api';
const SESSION_TTL = 8 * 60 * 60; // 8 hours

// ============================================================================
// Authentication Functions
// ============================================================================

/**
 * Verify admin authentication from request
 */
export async function verifyAdminAuth(req: NextRequest): Promise<AuthResult> {
  try {
    // Get token from Authorization header or cookie
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.cookies.get('admin_session')?.value;

    if (!token) {
      return { authenticated: false, error: 'No authentication token provided' };
    }

    // Verify JWT
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const sessionId = payload.session_id as string;
    const adminId = payload.admin_id as string;

    // Check session validity in Redis
    if (redis) {
      const sessionKey = `admin_session:${sessionId}`;
      const sessionData = await redis.get(sessionKey);
      
      if (!sessionData) {
        return { authenticated: false, error: 'Session expired or invalid' };
      }

      const session: AdminSession = JSON.parse(sessionData);
      
      // Refresh session TTL on activity
      await redis.expire(sessionKey, SESSION_TTL);

      return {
        authenticated: true,
        adminId: session.admin_id,
        email: session.email,
        role: session.role,
        permissions: session.permissions,
      };
    }

    // Fallback if Redis not available
    return {
      authenticated: true,
      adminId,
      email: payload.email as string,
      role: payload.role as AdminRole,
      permissions: payload.permissions as string[],
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('expired')) {
      return { authenticated: false, error: 'Token expired' };
    }
    logger.warn('Admin auth verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { authenticated: false, error: 'Invalid token' };
  }
}

/**
 * Check if admin has required permission
 */
export async function checkPermission(
  req: NextRequest,
  requiredPermission: string
): Promise<AuthResult & { hasPermission: boolean }> {
  const authResult = await verifyAdminAuth(req);
  
  if (!authResult.authenticated) {
    return { ...authResult, hasPermission: false };
  }

  const hasPermission = authResult.permissions?.includes(requiredPermission) || false;

  if (!hasPermission) {
    logger.warn('Permission denied', {
      admin_id: authResult.adminId,
      required_permission: requiredPermission,
      user_permissions: authResult.permissions,
    });
  }

  return { ...authResult, hasPermission };
}

/**
 * Create admin session
 */
export async function createAdminSession(
  admin: AdminUser,
  ipAddress: string,
  userAgent: string
): Promise<{ token: string; session: AdminSession }> {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL * 1000);

  const session: AdminSession = {
    session_id: sessionId,
    admin_id: admin.admin_id,
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions,
    ip_address: ipAddress,
    user_agent: userAgent,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  // Store session in Redis
  if (redis) {
    await redis.set(
      `admin_session:${sessionId}`,
      JSON.stringify(session),
      { ex: SESSION_TTL }
    );
  }

  // Create JWT
  const token = await new SignJWT({
    session_id: sessionId,
    admin_id: admin.admin_id,
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(JWT_SECRET);

  // Log session creation
  await logAdminAction(admin.admin_id, 'session_created', {
    session_id: sessionId,
    ip_address: ipAddress,
  });

  return { token, session };
}

/**
 * Invalidate admin session
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  if (redis) {
    await redis.del(`admin_session:${sessionId}`);
  }
}

/**
 * Invalidate all sessions for an admin
 */
export async function invalidateAllSessions(adminId: string): Promise<void> {
  if (redis) {
    const keys = await redis.keys(`admin_session:*`);
    for (const key of keys) {
      const sessionData = await redis.get(key);
      if (sessionData) {
        const session: AdminSession = JSON.parse(sessionData);
        if (session.admin_id === adminId) {
          await redis.del(key);
        }
      }
    }
  }
}

// ============================================================================
// Admin User Management
// ============================================================================

/**
 * Get admin user by email
 */
export async function getAdminByEmail(email: string): Promise<AdminUser | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const db = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await db
    .from('admin_users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    admin_id: data.admin_id,
    email: data.email,
    name: data.name,
    role: data.role,
    permissions: ROLE_PERMISSIONS[data.role as AdminRole] || [],
    created_at: data.created_at,
    last_login_at: data.last_login_at,
    mfa_enabled: data.mfa_enabled || false,
  };
}

/**
 * Verify admin password
 */
export async function verifyPassword(
  email: string,
  password: string
): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return false;
  }

  const db = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await db
    .from('admin_users')
    .select('password_hash')
    .eq('email', email)
    .single();

  if (error || !data?.password_hash) {
    return false;
  }

  // Compare with bcrypt (you'll need to add bcrypt to dependencies)
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, data.password_hash);
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log admin action for audit trail
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  details: Record<string, unknown>,
  targetTenantId?: string
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn('Cannot log admin action: Supabase not configured');
    return;
  }

  try {
    const db = createClient(supabaseUrl, supabaseKey);

    await db.from('admin_audit_log').insert({
      admin_id: adminId,
      action,
      details,
      target_tenant_id: targetTenantId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to log admin action', {
      admin_id: adminId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

const LOGIN_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  lockoutMs: 30 * 60 * 1000, // 30 minutes lockout
};

/**
 * Check login rate limit
 */
export async function checkLoginRateLimit(
  email: string,
  ipAddress: string
): Promise<{ allowed: boolean; remainingAttempts: number; lockedUntil?: Date }> {
  if (!redis) {
    return { allowed: true, remainingAttempts: LOGIN_RATE_LIMIT.maxAttempts };
  }

  const key = `login_attempts:${email}:${ipAddress}`;
  const lockKey = `login_lockout:${email}:${ipAddress}`;

  // Check if locked out
  const lockout = await redis.get(lockKey);
  if (lockout) {
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: new Date(parseInt(lockout)),
    };
  }

  // Get current attempts
  const attempts = await redis.get(key);
  const currentAttempts = attempts ? parseInt(attempts) : 0;

    if (currentAttempts >= LOGIN_RATE_LIMIT.maxAttempts) {
    // Lock out
    const lockoutUntil = Date.now() + LOGIN_RATE_LIMIT.lockoutMs;
    const lockoutSeconds = Math.ceil(LOGIN_RATE_LIMIT.lockoutMs / 1000);
    await redis.set(lockKey, lockoutUntil.toString(), { ex: lockoutSeconds });
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: new Date(lockoutUntil),
    };
  }

  return {
    allowed: true,
    remainingAttempts: LOGIN_RATE_LIMIT.maxAttempts - currentAttempts,
  };
}

/**
 * Record failed login attempt
 */
export async function recordFailedLogin(email: string, ipAddress: string): Promise<void> {
  if (!redis) return;

  const key = `login_attempts:${email}:${ipAddress}`;
  await redis.incr(key);
  await redis.expire(key, Math.floor(LOGIN_RATE_LIMIT.windowMs / 1000));
}

/**
 * Clear login attempts on successful login
 */
export async function clearLoginAttempts(email: string, ipAddress: string): Promise<void> {
  if (!redis) return;

  const key = `login_attempts:${email}:${ipAddress}`;
  const lockKey = `login_lockout:${email}:${ipAddress}`;
  await redis.del(key, lockKey);
}

// ============================================================================
// AdminAuth Static Class (Wrapper for API routes)
// ============================================================================

import { NextResponse } from 'next/server';

export type Permission = 
  | 'tenants:read' | 'tenants:write' | 'tenants:delete' | 'tenants:suspend'
  | 'users:read' | 'users:write' | 'users:delete'
  | 'settings:read' | 'settings:write'
  | 'analytics:read' | 'analytics:export'
  | 'logs:read' | 'logs:export'
  | 'billing:read' | 'billing:write';

/**
 * Static class wrapper for admin authentication
 * Provides a cleaner API for route handlers
 */
export class AdminAuth {
  /**
   * Require authentication for a route
   * Returns admin session or NextResponse error
   */
  static async requireAuth(
    request: NextRequest,
    allowedRoles?: AdminRole[]
  ): Promise<AdminSession | NextResponse> {
    const result = await verifyAdminAuth(request);

    if (!result.authenticated) {
      return NextResponse.json(
        { success: false, error: result.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check role if specified
    if (allowedRoles && allowedRoles.length > 0) {
      if (!result.role || !allowedRoles.includes(result.role)) {
        return NextResponse.json(
          { success: false, error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
    }

    // Build session object
    const session: AdminSession = {
      session_id: crypto.randomUUID(),
      admin_id: result.adminId!,
      email: result.email!,
      role: result.role!,
      permissions: result.permissions || [],
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    return session;
  }

  /**
   * Log an audit entry
   */
  static async logAuditEntry(
    adminId: string,
    action: string,
    targetTenantId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await logAdminAction(
      adminId,
      action,
      details || {},
      targetTenantId
    );
  }

  /**
   * Verify admin has a specific permission
   */
  static async hasPermission(
    request: NextRequest,
    permission: Permission
  ): Promise<boolean> {
    const result = await checkPermission(request, permission);
    return result.hasPermission;
  }

  /**
   * Create a new admin session
   */
  static createSession = createAdminSession;

  /**
   * Invalidate a session
   */
  static invalidateSession = invalidateSession;

  /**
   * Get admin by email
   */
  static getAdminByEmail = getAdminByEmail;

  /**
   * Verify password
   */
  static verifyPassword = verifyPassword;
}

export default {
  verifyAdminAuth,
  checkPermission,
  createAdminSession,
  invalidateSession,
  invalidateAllSessions,
  getAdminByEmail,
  verifyPassword,
  logAdminAction,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  AdminAuth,
};

/**
 * Authentication & Authorization Middleware
 * 
 * Provides secure authentication and tenant-based authorization
 * for API routes and server components.
 * 
 * Usage:
 * ```typescript
 * import { requireAuth, requireTenantAccess } from '@/middleware/auth';
 * 
 * export async function POST(req: Request) {
 *   const authResult = await requireAuth(req);
 *   if (authResult instanceof NextResponse) return authResult;
 *   
 *   const { user, session } = authResult;
 *   // Continue with authenticated request
 * }
 * ```
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Create Supabase client for server-side operations
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Extract auth token from request
 */
function getAuthToken(req: NextRequest | Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export interface AuthResult {
  user: {
    id: string;
    email?: string;
    role?: string;
  };
  session: any;
}

export interface TenantAccessResult extends AuthResult {
  role: 'owner' | 'admin' | 'member' | 'viewer';
  tenantId: string;
}

/**
 * Require authentication for API routes
 * 
 * @param req - Next.js request object
 * @returns AuthResult or NextResponse error
 */
export async function requireAuth(
  req: NextRequest | Request
): Promise<AuthResult | Response> {
  try {
    const token = getAuthToken(req);
    
    if (!token) {
      return NextResponse.json(
        { 
          error: 'Authentication required. Please provide a Bearer token.', 
          code: 'AUTH_REQUIRED' 
        },
        { status: 401 }
      );
    }
    
    const supabase = getSupabaseClient();
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('Auth token validation error:', error);
      return NextResponse.json(
        { 
          error: 'Invalid or expired token', 
          code: 'AUTH_INVALID',
          details: error?.message 
        },
        { status: 401 }
      );
    }
    
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role || undefined
      },
      session: { user }
    };
  } catch (error) {
    console.error('Auth middleware error:', error);
    return NextResponse.json(
      { 
        error: 'Internal authentication error', 
        code: 'AUTH_ERROR' 
      },
      { status: 500 }
    );
  }
}

/**
 * Require tenant access for API routes
 * Verifies user has access to specified tenant
 * 
 * @param req - Next.js request object
 * @param tenantId - Tenant ID to verify access for
 * @param minRole - Minimum role required (default: 'viewer')
 * @returns TenantAccessResult or NextResponse error
 */
export async function requireTenantAccess(
  req: NextRequest | Request,
  tenantId: string,
  minRole: 'owner' | 'admin' | 'member' | 'viewer' = 'viewer'
): Promise<TenantAccessResult | Response> {
  // First verify authentication
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { user, session } = authResult as AuthResult;
  
  if (!tenantId) {
    return NextResponse.json(
      { 
        error: 'Tenant ID is required', 
        code: 'INVALID_INPUT' 
      },
      { status: 400 }
    );
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // Check tenant access
    const { data, error } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();
    
    if (error || !data) {
      return NextResponse.json(
        { 
          error: 'Access denied to this tenant', 
          code: 'TENANT_ACCESS_DENIED',
          details: { tenantId }
        },
        { status: 403 }
      );
    }
    
    // Verify minimum role
    const roleHierarchy = {
      'owner': 4,
      'admin': 3,
      'member': 2,
      'viewer': 1
    };
    
    const userRoleLevel = roleHierarchy[data.role as keyof typeof roleHierarchy] || 0;
    const minRoleLevel = roleHierarchy[minRole];
    
    if (userRoleLevel < minRoleLevel) {
      return NextResponse.json(
        { 
          error: `Insufficient permissions. Minimum role required: ${minRole}`, 
          code: 'INSUFFICIENT_PERMISSIONS',
          details: { userRole: data.role, requiredRole: minRole }
        },
        { status: 403 }
      );
    }
    
    return {
      user,
      session,
      role: data.role as 'owner' | 'admin' | 'member' | 'viewer',
      tenantId
    };
  } catch (error) {
    console.error('Tenant access check error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to verify tenant access', 
        code: 'AUTH_ERROR' 
      },
      { status: 500 }
    );
  }
}

/**
 * Extract tenant ID from request
 * Checks body, query params, and headers
 * 
 * @param req - Next.js request object
 * @returns Tenant ID or null
 */
export async function extractTenantId(
  req: NextRequest | Request
): Promise<string | null> {
  // Check header
  if (req instanceof NextRequest) {
    const headerTenantId = req.headers.get('x-tenant-id');
    if (headerTenantId) return headerTenantId;
    
    // Check query params
    const { searchParams } = new URL(req.url);
    const queryTenantId = searchParams.get('tenantId');
    if (queryTenantId) return queryTenantId;
  }
  
  // Check body (for POST/PUT/PATCH)
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    try {
      const body = await req.json();
      if (body.tenantId) return body.tenantId;
    } catch {
      // Body not JSON or already consumed
    }
  }
  
  return null;
}

/**
 * Get user's tenant IDs
 * Returns all tenants the user has access to
 * 
 * @param userId - User ID
 * @returns Array of tenant IDs
 */
export async function getUserTenantIds(userId: string): Promise<string[]> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching user tenants:', error);
      return [];
    }
    
    return data.map((row: any) => row.tenant_id);
  } catch (error) {
    console.error('Error in getUserTenantIds:', error);
    return [];
  }
}

/**
 * Verify API key authentication (for service-to-service)
 * 
 * @param req - Next.js request object
 * @returns True if valid API key
 */
export async function verifyApiKey(
  req: NextRequest | Request
): Promise<boolean> {
  const apiKey = req.headers.get('x-api-key');
  
  if (!apiKey) return false;
  
  try {
    const supabase = getSupabaseClient();
    
    // Check if API key exists and is active
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, tenant_id, is_active')
      .eq('key_hash', apiKey) // In production, hash the key
      .eq('is_active', true)
      .single();
    
    if (error || !data) return false;
    
    return true;
  } catch (error) {
    console.error('API key verification error:', error);
    return false;
  }
}

/**
 * Optional authentication
 * Returns user info if authenticated, null otherwise
 * Useful for public endpoints that enhance experience for logged-in users
 * 
 * @param req - Next.js request object
 * @returns AuthResult or null
 */
export async function optionalAuth(
  req: NextRequest | Request
): Promise<AuthResult | null> {
  try {
    const token = getAuthToken(req);
    
    if (!token) return null;
    
    const supabase = getSupabaseClient();
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return null;
    
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role || undefined
      },
      session: { user }
    };
  } catch (error) {
    console.error('Optional auth error:', error);
    return null;
  }
}

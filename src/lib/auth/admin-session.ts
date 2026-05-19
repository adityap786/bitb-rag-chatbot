/**
 * Admin Session Authentication
 * 
 * Replaces static API key with secure session-based authentication.
 * Provides JWT sessions with expiry and refresh capability.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sign, verify, JwtPayload } from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
const SESSION_EXPIRY = '4h';
const REFRESH_EXPIRY = '7d';

export interface AdminUser {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'support';
    permissions: string[];
}

export interface AdminSession {
    userId: string;
    email: string;
    role: string;
    permissions: string[];
    sessionId: string;
    type: 'access' | 'refresh';
    iat: number;
    exp: number;
}

/**
 * Creates password hash
 */
export function hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
    return `${salt}:${hash}`;
}

/**
 * Verifies password against hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const computedHash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
    return computedHash === hash;
}

/**
 * Creates admin session tokens
 */
export function createAdminSession(user: AdminUser): { accessToken: string; refreshToken: string } {
    if (!ADMIN_JWT_SECRET) {
        throw new Error('ADMIN_JWT_SECRET not configured');
    }

    const sessionId = randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);

    const accessPayload: Partial<AdminSession> = {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        sessionId,
        type: 'access',
    };

    const refreshPayload: Partial<AdminSession> = {
        userId: user.id,
        sessionId,
        type: 'refresh',
    };

    const accessToken = sign(accessPayload, ADMIN_JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: SESSION_EXPIRY,
        audience: 'bitb-admin',
        issuer: 'bitb.ltd',
    });

    const refreshToken = sign(refreshPayload, ADMIN_JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: REFRESH_EXPIRY,
        audience: 'bitb-admin-refresh',
        issuer: 'bitb.ltd',
    });

    return { accessToken, refreshToken };
}

/**
 * Verifies admin access token
 */
export function verifyAdminToken(token: string): AdminSession {
    if (!ADMIN_JWT_SECRET) {
        throw new Error('ADMIN_JWT_SECRET not configured');
    }

    try {
        const decoded = verify(token, ADMIN_JWT_SECRET, {
            algorithms: ['HS256'],
            audience: 'bitb-admin',
            issuer: 'bitb.ltd',
        });

        if (typeof decoded === 'object' && decoded !== null &&
            'userId' in decoded && 'type' in decoded && decoded.type === 'access') {
            return decoded as AdminSession;
        }

        throw new Error('Invalid token structure');
    } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
            throw new Error('Session expired');
        }
        throw new Error('Invalid session');
    }
}

/**
 * Refreshes admin session using refresh token
 */
export async function refreshAdminSession(refreshToken: string): Promise<{ accessToken: string } | null> {
    if (!ADMIN_JWT_SECRET) return null;

    try {
        const decoded = verify(refreshToken, ADMIN_JWT_SECRET, {
            algorithms: ['HS256'],
            audience: 'bitb-admin-refresh',
            issuer: 'bitb.ltd',
        }) as JwtPayload & { userId: string; sessionId: string; type: string };

        if (decoded.type !== 'refresh') return null;

        // Fetch user to get current permissions
        const { data: user, error } = await supabase
            .from('admin_users')
            .select('id, email, role, permissions')
            .eq('id', decoded.userId)
            .single();

        if (error || !user) return null;

        const accessPayload: Partial<AdminSession> = {
            userId: user.id,
            email: user.email,
            role: user.role,
            permissions: user.permissions || [],
            sessionId: decoded.sessionId,
            type: 'access',
        };

        const accessToken = sign(accessPayload, ADMIN_JWT_SECRET, {
            algorithm: 'HS256',
            expiresIn: SESSION_EXPIRY,
            audience: 'bitb-admin',
            issuer: 'bitb.ltd',
        });

        return { accessToken };
    } catch {
        return null;
    }
}

/**
 * Middleware to require admin authentication
 */
export async function requireAdminAuth(req: NextRequest): Promise<NextResponse | AdminSession> {
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
            { error: 'Admin authentication required' },
            { status: 401 }
        );
    }

    const token = authHeader.substring(7);

    try {
        const session = verifyAdminToken(token);
        return session;
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Invalid admin session' },
            { status: 401 }
        );
    }
}

/**
 * Checks if admin has required permission
 */
export function hasPermission(session: AdminSession, permission: string): boolean {
    // Super admins have all permissions
    if (session.role === 'super_admin') return true;

    return session.permissions.includes(permission);
}

/**
 * Middleware to require specific permission
 */
export async function requirePermission(
    req: NextRequest,
    requiredPermission: string
): Promise<NextResponse | AdminSession> {
    const authResult = await requireAdminAuth(req);

    if (authResult instanceof NextResponse) {
        return authResult; // Auth failed
    }

    if (!hasPermission(authResult, requiredPermission)) {
        return NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
        );
    }

    return authResult;
}

/**
 * Login handler for admin users
 */
export async function loginAdmin(email: string, password: string): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    user?: AdminUser;
    error?: string;
}> {
    const { data: user, error } = await supabase
        .from('admin_users')
        .select('id, email, password_hash, role, permissions')
        .eq('email', email.toLowerCase())
        .single();

    if (error || !user) {
        return { success: false, error: 'Invalid credentials' };
    }

    if (!verifyPassword(password, user.password_hash)) {
        return { success: false, error: 'Invalid credentials' };
    }

    const adminUser: AdminUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
    };

    const tokens = createAdminSession(adminUser);

    return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: adminUser,
    };
}

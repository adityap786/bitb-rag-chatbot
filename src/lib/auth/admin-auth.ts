/**
 * Admin JWT Authentication
 * Implements secure JWT-based authentication for admin routes with refresh token support
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../observability/logger';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '7d'; // Long-lived refresh token
const BCRYPT_ROUNDS = 12;

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'super_admin' | 'admin' | 'viewer';
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface AdminTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AdminJWTPayload {
  sub: string; // user id
  email: string;
  role: 'super_admin' | 'admin' | 'viewer';
  iat?: number;
  exp?: number;
}

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(user: AdminUser): string {
  const payload: AdminJWTPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: 'HS256',
    issuer: 'bitb-admin',
  });
}

/**
 * Generate refresh token (long-lived)
 */
export function generateRefreshToken(userId: string): string {
  const payload = {
    sub: userId,
    type: 'refresh',
  };

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    algorithm: 'HS256',
    issuer: 'bitb-admin',
  });
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): AdminJWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'bitb-admin',
    }) as AdminJWTPayload;
    return decoded;
  } catch (error) {
    logger.warn('Access token verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Verify and decode refresh token
 */
export function verifyRefreshToken(token: string): { sub: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      issuer: 'bitb-admin',
    }) as { sub: string; type: string };
    
    if (decoded.type !== 'refresh') {
      return null;
    }
    
    return { sub: decoded.sub };
  } catch (error) {
    logger.warn('Refresh token verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Authenticate admin user with email and password
 */
export async function authenticateAdmin(
  email: string,
  password: string
): Promise<{ user: AdminUser; tokens: AdminTokens } | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Get user by email
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    if (error || !user) {
      logger.warn('Admin login failed: user not found', { email });
      return null;
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      logger.warn('Admin login failed: invalid password', { email, userId: user.id });
      return null;
    }

    // Update last login timestamp
    await supabase
      .from('admin_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user.id);

    // Store refresh token hash in database
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await supabase.from('admin_refresh_tokens').insert({
      admin_user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });

    logger.info('Admin login successful', { email, userId: user.id, role: user.role });

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 15 * 60, // 15 minutes in seconds
      },
    };
  } catch (error) {
    logger.error('Admin authentication error', {
      error: error instanceof Error ? error.message : String(error),
      email,
    });
    return null;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return null;
    }

    // Check if refresh token exists and is not revoked
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const { data: tokenRecord, error: tokenError } = await supabase
      .from('admin_refresh_tokens')
      .select('admin_user_id, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .single();

    if (tokenError || !tokenRecord || tokenRecord.revoked_at) {
      logger.warn('Refresh token not found or revoked', { userId: decoded.sub });
      return null;
    }

    // Check if token is expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      logger.warn('Refresh token expired', { userId: decoded.sub });
      return null;
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', tokenRecord.admin_user_id)
      .eq('is_active', true)
      .single();

    if (userError || !user) {
      logger.warn('User not found or inactive', { userId: decoded.sub });
      return null;
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    logger.info('Access token refreshed', { userId: user.id, email: user.email });

    return {
      accessToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  } catch (error) {
    logger.error('Token refresh error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Revoke refresh token (logout)
 */
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const { error } = await supabase
      .from('admin_refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash);

    if (error) {
      logger.error('Failed to revoke refresh token', { error: error.message });
      return false;
    }

    logger.info('Refresh token revoked');
    return true;
  } catch (error) {
    logger.error('Token revocation error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Get admin user by ID
 */
export async function getAdminUser(userId: string): Promise<AdminUser | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, email, full_name, role, is_active, created_at, last_login_at')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Failed to get admin user', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return null;
  }
}

/**
 * Create new admin user
 */
export async function createAdminUser(
  email: string,
  password: string,
  fullName: string | null,
  role: 'super_admin' | 'admin' | 'viewer' = 'admin'
): Promise<AdminUser | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const passwordHash = await hashPassword(password);

    const { data: user, error } = await supabase
      .from('admin_users')
      .insert({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        full_name: fullName,
        role,
        is_active: true,
      })
      .select('id, email, full_name, role, is_active, created_at, last_login_at')
      .single();

    if (error || !user) {
      logger.error('Failed to create admin user', { error: error?.message, email });
      return null;
    }

    logger.info('Admin user created', { userId: user.id, email: user.email, role: user.role });
    return user;
  } catch (error) {
    logger.error('Admin user creation error', {
      error: error instanceof Error ? error.message : String(error),
      email,
    });
    return null;
  }
}

/**
 * AdminAuthService - Production-grade JWT-based admin authentication
 * - Short-lived access tokens, refresh tokens, token rotation, password hashing,
 *   RBAC helpers, and DB-backed persistence in `admin_users` and `admin_refresh_tokens`.
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { getServiceClient } from '../supabase-client';
import { logger } from '../observability/logger';

export interface AdminUser {
  id: string;
  email: string;
  full_name?: string | null;
  role: 'super_admin' | 'admin' | 'viewer';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  last_login_at?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface AdminAuthOptions {
  jwtSecret?: string;
  accessTokenExpiry?: string | number; // e.g. '15m' or seconds
  refreshTokenExpiry?: string | number; // e.g. '7d' or seconds
  bcryptRounds?: number;
  refreshTokenBytes?: number; // size for random token in bytes
  roleHierarchy?: Record<string, number>;
}

function parseExpiryToMs(exp: string | number): number {
  if (typeof exp === 'number') return exp * 1000;
  const s = String(exp).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;
  if (s.endsWith('ms')) return parseInt(s.slice(0, -2), 10);
  if (s.endsWith('s')) return parseInt(s.slice(0, -1), 10) * 1000;
  if (s.endsWith('m')) return parseInt(s.slice(0, -1), 10) * 60 * 1000;
  if (s.endsWith('h')) return parseInt(s.slice(0, -1), 10) * 60 * 60 * 1000;
  if (s.endsWith('d')) return parseInt(s.slice(0, -1), 10) * 24 * 60 * 60 * 1000;
  // default 15 minutes
  return 15 * 60 * 1000;
}

function parseExpiryToSeconds(exp: string | number): number {
  return Math.floor(parseExpiryToMs(exp) / 1000);
}

export class AdminAuthService {
  private readonly secret: string;
  private readonly accessTokenExpiry: string | number;
  private readonly refreshTokenExpiry: string | number;
  private readonly bcryptRounds: number;
  private readonly refreshTokenBytes: number;
  private readonly roleHierarchy: Record<string, number>;

  constructor(options: AdminAuthOptions = {}) {
    this.secret = options.jwtSecret || process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || '';
    if (!this.secret) throw new Error('Admin JWT secret not configured');
    this.accessTokenExpiry = options.accessTokenExpiry ?? '15m';
    this.refreshTokenExpiry = options.refreshTokenExpiry ?? '7d';
    this.bcryptRounds = options.bcryptRounds ?? 12;
    this.refreshTokenBytes = options.refreshTokenBytes ?? 64;
    this.roleHierarchy = options.roleHierarchy ?? { viewer: 1, admin: 2, super_admin: 3 };
  }

  private supabase() {
    return getServiceClient();
  }

  private signAccessToken(user: { id: string; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return jwt.sign(payload, this.secret, {
      expiresIn: String(this.accessTokenExpiry),
      algorithm: 'HS256',
      issuer: 'bitb-admin',
    } as any);
  }

  private async storeRefreshToken(adminUserId: string): Promise<string> {
    const plain = crypto.randomBytes(this.refreshTokenBytes).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plain).digest('hex');
    const expiresAt = new Date(Date.now() + parseExpiryToMs(this.refreshTokenExpiry));

    const supabase = this.supabase();
    const { error } = await supabase.from('admin_refresh_tokens').insert({
      admin_user_id: adminUserId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });
    if (error) {
      logger.error('Failed to store refresh token', { error: error.message });
      throw new Error('Failed to persist refresh token');
    }
    return plain;
  }

  private async revokeRefreshTokenByHash(tokenHash: string) {
    const supabase = this.supabase();
    const { error } = await supabase
      .from('admin_refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash);
    if (error) {
      logger.warn('Failed to revoke refresh token', { error: error.message });
    }
  }

  async login(email: string, password: string, ip?: string): Promise<AuthTokens> {
    const supabase = this.supabase();
    const normalized = email.toLowerCase().trim();
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, email, full_name, role, is_active, password_hash, created_at, last_login_at')
      .eq('email', normalized)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      logger.warn('Admin login failed - user not found or inactive', { email: normalized });
      throw new Error('Invalid credentials');
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      logger.warn('Admin login failed - invalid password', { email: normalized, userId: user.id });
      throw new Error('Invalid credentials');
    }

    // Update last login timestamp (best-effort)
    await supabase.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.storeRefreshToken(user.id);

    logger.info('Admin login', { userId: user.id, email: normalized, ip });
    return { accessToken, refreshToken, expiresIn: parseExpiryToSeconds(this.accessTokenExpiry) };
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.revokeRefreshTokenByHash(tokenHash);
    logger.info('Admin logout - refresh token revoked');
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const supabase = this.supabase();

      // Find active token
      const { data: tokenRow, error: tokenErr } = await supabase
        .from('admin_refresh_tokens')
        .select('id, admin_user_id, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (tokenErr || !tokenRow) {
        logger.warn('Refresh token invalid or expired');
        throw new Error('Invalid refresh token');
      }

      // Revoke the used token (rotation)
      const { error: revokeErr } = await supabase
        .from('admin_refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenRow.id)
        .is('revoked_at', null);

      if (revokeErr) {
        logger.warn('Failed to revoke old refresh token during rotation', { err: revokeErr.message });
      }

      // Load user
      const { data: user, error: userErr } = await supabase
        .from('admin_users')
        .select('id, email, full_name, role, is_active, created_at, last_login_at')
        .eq('id', tokenRow.admin_user_id)
        .eq('is_active', true)
        .single();

      if (userErr || !user) {
        logger.warn('User for refresh token not found or inactive');
        throw new Error('Invalid refresh token');
      }

      const accessToken = this.signAccessToken(user);
      const newRefreshToken = await this.storeRefreshToken(user.id);

      logger.info('Refresh token rotated', { userId: user.id });
      return { accessToken, refreshToken: newRefreshToken, expiresIn: parseExpiryToSeconds(this.accessTokenExpiry) };
    } catch (err) {
      logger.warn('refreshTokens failed', { err: err instanceof Error ? err.message : String(err) });
      throw new Error('Invalid refresh token');
    }
  }

  async verifyToken(accessToken: string): Promise<AdminUser> {
    try {
      const payload = jwt.verify(accessToken, this.secret, {
        algorithms: ['HS256'],
        issuer: 'bitb-admin',
      }) as any;

      const supabase = this.supabase();
      const { data: user, error } = await supabase
        .from('admin_users')
        .select('id, email, full_name, role, is_active, created_at, last_login_at')
        .eq('id', payload.sub)
        .eq('is_active', true)
        .single();

      if (error || !user) {
        logger.warn('Token valid but user not found or inactive', { userId: payload.sub });
        throw new Error('Invalid access token');
      }

      return user as AdminUser;
    } catch (err) {
      logger.warn('Invalid access token', { err: err instanceof Error ? err.message : String(err) });
      throw new Error('Invalid access token');
    }
  }

  async hasPermission(user: AdminUser, permission: string): Promise<boolean> {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    // Permission format: '<role>:<capability>' e.g. 'admin:manage-users'
    const parts = String(permission || '').split(':');
    const requiredRole = parts[0] || 'admin';
    const requiredLevel = this.roleHierarchy[requiredRole] ?? 2;
    const userLevel = this.roleHierarchy[user.role] ?? 1;
    return userLevel >= requiredLevel;
  }

  // --- User management helpers ---
  async createUser(email: string, password: string, role: AdminUser['role'] = 'admin', fullName?: string | null) {
    const supabase = this.supabase();
    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);
    const { data: user, error } = await supabase
      .from('admin_users')
      .insert({ email: email.toLowerCase().trim(), password_hash: passwordHash, full_name: fullName, role, is_active: true })
      .select('id, email, full_name, role, is_active, created_at, last_login_at')
      .single();
    if (error || !user) {
      logger.error('Failed to create admin user', { error: error?.message, email });
      throw new Error('Failed to create user');
    }
    logger.info('Admin user created', { userId: user.id, email: user.email, role: user.role });
    return user as AdminUser;
  }

  async listUsers(limit = 50, offset = 0) {
    const supabase = this.supabase();
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, email, full_name, role, is_active, created_at, last_login_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      logger.error('Failed to list admin users', { error: error.message });
      throw new Error('Failed to list users');
    }
    return data as AdminUser[];
  }

  async getUserById(id: string) {
    const supabase = this.supabase();
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, email, full_name, role, is_active, created_at, last_login_at')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return data as AdminUser;
  }

  async changePassword(adminUserId: string, currentPassword: string, newPassword: string) {
    const supabase = this.supabase();
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, password_hash')
      .eq('id', adminUserId)
      .single();
    if (error || !user) throw new Error('User not found');
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) throw new Error('Current password incorrect');
    const newHash = await bcrypt.hash(newPassword, this.bcryptRounds);
    const { error: updErr } = await supabase.from('admin_users').update({ password_hash: newHash }).eq('id', adminUserId);
    if (updErr) {
      logger.error('Failed to update password', { err: updErr.message });
      throw new Error('Failed to update password');
    }
    // Revoke existing refresh tokens
    await this.revokeTokensForUser(adminUserId);
    return true;
  }

  async revokeTokensForUser(adminUserId: string) {
    const supabase = this.supabase();
    const { error } = await supabase
      .from('admin_refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('admin_user_id', adminUserId)
      .is('revoked_at', null);
    if (error) {
      logger.warn('Failed to revoke tokens for user', { userId: adminUserId, err: error.message });
    }
  }
}

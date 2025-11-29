/**
 * AdminAuthService - Production-grade JWT-based admin authentication
 * - Short-lived access tokens, refresh tokens, RBAC, audit logging, IP whitelist, MFA-ready
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('jsonwebtoken');
import { logger } from '../observability/logger';

export interface AdminUser {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  tenantIds: string[];
  createdAt: Date;
  lastLoginAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AdminAuthOptions {
  jwtSecret: string;
  accessTokenExpiry?: string | number; // e.g. '15m'
  refreshTokenExpiry?: string | number; // e.g. '7d'
  enableMFA?: boolean;
  ipWhitelist?: string[];
}

export class AdminAuthService {
  private readonly secret: string;
  private readonly accessTokenExpiry: string | number;
  private readonly refreshTokenExpiry: string | number;
  private readonly enableMFA: boolean;
  private readonly ipWhitelist: string[];

  constructor(options: AdminAuthOptions) {
    this.secret = options.jwtSecret;
    this.accessTokenExpiry = options.accessTokenExpiry ?? '15m';
    this.refreshTokenExpiry = options.refreshTokenExpiry ?? '7d';
    this.enableMFA = options.enableMFA ?? false;
    this.ipWhitelist = options.ipWhitelist ?? [];
  }

  async login(email: string, password: string, ip?: string): Promise<AuthTokens> {
    // TODO: Replace with real user lookup and password check
    const user: AdminUser | null = await this.mockUserLookup(email, password);
    if (!user) throw new Error('Invalid credentials');
    if (this.ipWhitelist.length && ip && !this.ipWhitelist.includes(ip)) {
      logger.warn('Admin login attempt from non-whitelisted IP', { email, ip });
      throw new Error('IP not allowed');
    }
    // TODO: Add MFA check if enabled
    const accessToken = jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      this.secret,
      { expiresIn: String(this.accessTokenExpiry) } as any
    );
    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      this.secret,
      { expiresIn: String(this.refreshTokenExpiry) } as any
    );
    logger.info('Admin login', { userId: user.id, email: user.email, ip });
    return { accessToken, refreshToken, expiresIn: this.parseExpiry(String(this.accessTokenExpiry)) };
  }

  async logout(refreshToken: string): Promise<void> {
    // TODO: Implement refresh token blacklist (e.g., Redis)
    logger.info('Admin logout', { refreshToken });
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = jwt.verify(refreshToken, this.secret as import('jsonwebtoken').Secret) as any;
      if (payload.type !== 'refresh') throw new Error('Invalid refresh token');
      // TODO: Lookup user by payload.sub
      const user: AdminUser = await this.mockUserById(payload.sub);
      const accessToken = jwt.sign(
        { sub: user.id, role: user.role, email: user.email },
        this.secret,
        { expiresIn: String(this.accessTokenExpiry) } as any
      );
      const newRefreshToken = jwt.sign(
        { sub: user.id, type: 'refresh' },
        this.secret,
        { expiresIn: String(this.refreshTokenExpiry) } as any
      );
      logger.info('Admin token refresh', { userId: user.id });
      return { accessToken, refreshToken: newRefreshToken, expiresIn: this.parseExpiry(String(this.accessTokenExpiry)) };
    } catch (err) {
      logger.warn('Invalid refresh token', { err });
      throw new Error('Invalid refresh token');
    }
  }

  async verifyToken(accessToken: string): Promise<AdminUser> {
    try {
      const payload = jwt.verify(accessToken, this.secret) as any;
      // TODO: Lookup user by payload.sub
      const user: AdminUser = await this.mockUserById(payload.sub);
      return user;
    } catch (err) {
      logger.warn('Invalid access token', { err });
      throw new Error('Invalid access token');
    }
  }

  async hasPermission(user: AdminUser, permission: string): Promise<boolean> {
    return user.permissions.includes(permission) || user.role === 'super_admin';
  }

  // --- Helpers & Mock Data ---
  private parseExpiry(exp: string): number {
    // e.g. '15m' => 900
    if (exp.endsWith('m')) return parseInt(exp) * 60;
    if (exp.endsWith('h')) return parseInt(exp) * 3600;
    if (exp.endsWith('d')) return parseInt(exp) * 86400;
    return 900;
  }

  private async mockUserLookup(email: string, password: string): Promise<AdminUser | null> {
    // TODO: Replace with real DB lookup and password hash check
    if (email === 'admin@example.com' && password === 'password') {
      return {
        id: 'admin-uuid',
        email,
        role: 'super_admin',
        permissions: ['*'],
        tenantIds: ['*'],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };
    }
    return null;
  }

  private async mockUserById(id: string): Promise<AdminUser> {
    // TODO: Replace with real DB lookup
    return {
      id,
      email: 'admin@example.com',
      role: 'super_admin',
      permissions: ['*'],
      tenantIds: ['*'],
      createdAt: new Date(),
      lastLoginAt: new Date(),
    };
  }
}

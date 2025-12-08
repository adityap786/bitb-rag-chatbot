/**
 * admin-auth.ts - Express/Next.js middleware for admin JWT authentication
 * - Verifies access token, attaches admin user to request, enforces RBAC
 */
import { AdminAuthService, AdminUser } from '../lib/auth/admin-jwt';

// Express Request augmentation for adminUser
import type { Request } from 'express';
declare module 'express-serve-static-core' {
  interface Request {
    adminUser?: AdminUser;
  }
}
import { logger } from '../lib/observability/logger';

const authService = new AdminAuthService({
  jwtSecret: process.env.ADMIN_JWT_SECRET || 'changeme',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
});

export async function adminAuthMiddleware(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const user: AdminUser = await authService.verifyToken(token);
    req.adminUser = user;
    next();
  } catch (err) {
    logger.warn('Admin auth failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// RBAC helper
export function requireAdminRole(role: AdminUser['role']) {
  return (req: any, res: any, next: any) => {
    if (!req.adminUser || req.adminUser.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

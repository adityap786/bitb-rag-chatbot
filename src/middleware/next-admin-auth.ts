// next-admin-auth.ts - Next.js API middleware for admin JWT authentication and RBAC
import { NextApiRequest, NextApiResponse } from 'next';
import { AdminAuthService, AdminUser } from '../lib/auth/admin-jwt';
import { logger } from '../lib/observability/logger';

const authService = new AdminAuthService({
  jwtSecret: process.env.ADMIN_JWT_SECRET || 'changeme',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
});

export async function nextAdminAuth(req: NextApiRequest, res: NextApiResponse, next: () => void) {
  try {
    const authHeader = req.headers['authorization'] || req.cookies['accessToken'];
    if (!authHeader || (typeof authHeader === 'string' && !authHeader.startsWith('Bearer '))) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const token = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '').trim() : '';
    const user: AdminUser = await authService.verifyToken(token);
    (req as any).adminUser = user;
    next();
  } catch (err) {
    logger.warn('Admin auth failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireAdminPermission(permission: string) {
  return async (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
    const user: AdminUser | undefined = (req as any).adminUser;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const has = await authService.hasPermission(user, permission);
    if (!has) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

// Usage example in Next.js API route:
// import { nextAdminAuth, requireAdminPermission } from '../../middleware/next-admin-auth';
// export default async function handler(req, res) {
//   await nextAdminAuth(req, res, async () => {
//     await requireAdminPermission('admin:read')(req, res, async () => {
//       // ...your handler logic
//     });
//   });
// }

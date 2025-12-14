import type { NextApiRequest, NextApiResponse } from 'next';
import { AdminAuthService } from '../../../lib/auth/admin-jwt';

const authService = new AdminAuthService({ jwtSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });

    await authService.logout(String(refreshToken));
    return res.status(200).json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Logout failed';
    return res.status(500).json({ error: msg });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { AdminAuthService } from '../../../lib/auth/admin-jwt';

const authService = new AdminAuthService({ jwtSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;
    const tokens = await authService.login(String(email), String(password), ip as string | undefined);

    // Do not expose internal details
    return res.status(200).json(tokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Authentication failed';
    return res.status(401).json({ error: msg });
  }
}

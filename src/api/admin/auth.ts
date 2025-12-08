/**
 * Admin Auth API routes (Express-style, can adapt for Next.js API routes)
 * - /api/admin/login
 * - /api/admin/refresh
 * - /api/admin/logout
 * - /api/admin/me
 */
import express from 'express';
import { AdminAuthService } from '../../lib/auth/admin-jwt';
import { adminAuthMiddleware } from '../../middleware/admin-auth';

const router = express.Router();
const authService = new AdminAuthService({
  jwtSecret: process.env.ADMIN_JWT_SECRET || 'changeme',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
});

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;
    const tokens = await authService.login(email, password, ip);
    // Set httpOnly cookie for refresh token (optional)
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: tokens.expiresIn * 1000 });
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/admin/refresh
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    const tokens = await authService.refreshTokens(refreshToken);
    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: tokens.expiresIn * 1000 });
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/admin/logout
router.post('/logout', adminAuthMiddleware, async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    await authService.logout(refreshToken);
    res.clearCookie('refreshToken');
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/admin/me
router.get('/me', adminAuthMiddleware, (req, res) => {
  res.json({ user: req.adminUser });
});

export default router;

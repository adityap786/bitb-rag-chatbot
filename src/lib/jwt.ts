/**
 * JWT Utility for WebSocket Authentication
 * Wraps existing JWT verification for use in WebSocket server
 */

import jwt from 'jsonwebtoken';

export interface JWTPayload {
  tenantId: string;
  sessionId: string;
  type?: 'setup' | 'access' | 'refresh';
  email?: string;
  iat?: number;
  exp?: number;
}

/**
 * Verify a JWT token and return the payload
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    const payload = jwt.verify(token, secret) as JWTPayload;
    return payload;
  } catch (error) {
    console.error('[JWT] Verification failed:', error);
    return null;
  }
}

/**
 * Generate a JWT token for a tenant/session
 * @param tenantId - Tenant ID
 * @param sessionId - Session ID
 * @returns JWT token string
 */
export function generateJWT(tenantId: string, sessionId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  // Include a token type so it is compatible with verifyBearerToken()/verifyToken()
  // used across the trial/onboarding APIs.
  const payload: JWTPayload = { tenantId, sessionId, type: 'access' };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

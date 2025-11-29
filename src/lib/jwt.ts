/**
 * JWT Utility for WebSocket Authentication
 * Wraps existing JWT verification for use in WebSocket server
 */

import jwt from 'jsonwebtoken';

export interface JWTPayload {
  tenantId: string;
  sessionId: string;
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
    const secret = process.env.JWT_SECRET || 'your-secret-key';
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
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  const payload: JWTPayload = { tenantId, sessionId };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

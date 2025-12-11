/**
 * Authentication and authorization utilities for trial system
 */

import { NextRequest } from 'next/server';
import { verify, JwtPayload, SignOptions } from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError } from './errors';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = 'HS256';
const TOKEN_EXPIRY = '24h';

/**
 * JWT token payload
 */
export interface TokenPayload extends JwtPayload {
  tenantId: string;
  email?: string;
  type: 'setup' | 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * Verify JWT token and extract payload
 */
export function verifyToken(token: string): TokenPayload {
  if (!JWT_SECRET) {
    // Fail with an authentication-style error so callers receive a 401/500 mapped response
    throw new AuthenticationError('Server configuration error: JWT_SECRET is not configured');
  }

  try {
    const decoded = verify(token, JWT_SECRET as string, {
      algorithms: [JWT_ALGORITHM],
    });

    if (typeof decoded === 'object' && decoded !== null && 'tenantId' in decoded && 'type' in decoded) {
      return decoded as TokenPayload;
    }

    throw new AuthenticationError('Invalid token structure');
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AuthenticationError('Invalid token format');
    }
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError('Token verification failed');
  }
}

/**
 * Extract and verify Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) {
    throw new AuthenticationError('Authorization header is missing');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Authorization header must use Bearer scheme');
  }

  const token = authHeader.substring(7);
  if (!token) {
    throw new AuthenticationError('Token is empty');
  }

  return token;
}

/**
 * Get and verify Bearer token from request
 */
export function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization');
  return extractBearerToken(authHeader);
}

/**
 * Verify Bearer token from request and return payload
 */
export function verifyBearerToken(req: NextRequest): TokenPayload {
  const token = getBearerToken(req);
  return verifyToken(token);
}

/**
 * Admin authentication check
 * Checks for a special Admin API Key in headers for now.
 * In production, this should use a proper session/role check.
 */
export function requireAdmin(req: NextRequest): void {
  const adminKey = req.headers.get('x-admin-api-key');
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey) {
    throw new AuthorizationError('Server configuration error: ADMIN_API_KEY is not set');
  }

  if (!adminKey || adminKey !== configuredKey) {
    throw new AuthorizationError('Invalid or missing Admin API Key');
  }
}

/**
 * Verify tenant ownership
 */
export function verifyTenantOwnership(requestTenantId: string, tokenTenantId: string): void {
  if (requestTenantId !== tokenTenantId) {
    throw new AuthorizationError('You do not have permission to access this tenant');
  }
}

/**
 * Check token type
 */
export function requireTokenType(token: TokenPayload, requiredType: string): void {
  if (token.type !== requiredType) {
    throw new AuthorizationError(`This operation requires a ${requiredType} token`);
  }
}

/**
 * Rate limiting store (in-memory for single instance, use Redis for distributed)
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now >= entry.resetAt) {
    // New window
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, retryAfter: 0 };
}

/**
 * Cleanup expired rate limit entries (run periodically)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes (attach to globalThis to avoid duplicates)
// Declare a type for the runtime global so TypeScript doesn't complain
declare global {
  // attach a property to the global runtime object for cleanup
  var rateLimitCleanupInterval: ReturnType<typeof setInterval> | undefined;
}

if (typeof globalThis !== 'undefined') {
  if (!globalThis.rateLimitCleanupInterval) {
    // Use globalThis which works in Node.js and browser-like runtimes
    globalThis.rateLimitCleanupInterval = setInterval(
      cleanupRateLimitStore,
      5 * 60 * 1000
    );
  }
}

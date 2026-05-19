/**
 * Request Body Size Validation Middleware
 * 
 * Enforces maximum body size to prevent DoS attacks via large payloads.
 * Default limit: 10MB (configurable per route)
 */

import { NextRequest, NextResponse } from 'next/server';

// Default limits in bytes
const DEFAULT_LIMIT = 10 * 1024 * 1024; // 10MB
const KB_INGEST_LIMIT = 50 * 1024 * 1024; // 50MB for file uploads
const CHAT_LIMIT = 64 * 1024; // 64KB for chat messages

// Route-specific limits
const ROUTE_LIMITS: Record<string, number> = {
    '/api/trial/kb/ingest': KB_INGEST_LIMIT,
    '/api/trial/kb/upload': KB_INGEST_LIMIT,
    '/api/ask': CHAT_LIMIT,
    '/api/mcp/tools/handleRagQuery': CHAT_LIMIT,
};

/**
 * Get the body size limit for a specific route
 */
export function getBodySizeLimit(pathname: string): number {
    // Check exact match first
    if (ROUTE_LIMITS[pathname]) {
        return ROUTE_LIMITS[pathname];
    }

    // Check prefix matches
    for (const [route, limit] of Object.entries(ROUTE_LIMITS)) {
        if (pathname.startsWith(route)) {
            return limit;
        }
    }

    return DEFAULT_LIMIT;
}

/**
 * Validate request body size
 * 
 * @returns NextResponse if body exceeds limit, undefined if valid
 */
export async function validateBodySize(
    req: NextRequest,
    customLimit?: number
): Promise<NextResponse | null> {
    const contentLength = req.headers.get('content-length');
    const limit = customLimit ?? getBodySizeLimit(req.nextUrl.pathname);

    // Check Content-Length header first (fast path)
    if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (!isNaN(size) && size > limit) {
            return NextResponse.json(
                {
                    error: 'Request body too large',
                    limit: `${Math.round(limit / 1024 / 1024)}MB`,
                    received: `${Math.round(size / 1024 / 1024)}MB`,
                },
                { status: 413 }
            );
        }
    }

    return null;
}

/**
 * Create a body size validation middleware for use in route handlers
 * 
 * Usage:
 * ```typescript
 * const bodyCheck = await validateBodySize(req);
 * if (bodyCheck) return bodyCheck;
 * ```
 */
export function createBodySizeMiddleware(limitMB: number = 10) {
    const limitBytes = limitMB * 1024 * 1024;

    return async (req: NextRequest): Promise<NextResponse | null> => {
        return validateBodySize(req, limitBytes);
    };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

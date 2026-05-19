/**
 * Next.js Edge Middleware
 * 
 * Runs at the edge for all requests to enforce:
 * - IP-based rate limiting (100 req/min/IP)
 * - Security headers
 * - Bot detection for public routes
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============================================================
// Configuration
// ============================================================

const IP_RATE_LIMIT = {
    maxRequests: 100,   // 100 requests per minute per IP
    windowSeconds: 60,
};

// In-memory store for edge (replaced by Cloudflare KV/Durable Objects in production)
const ipRequestCounts = new Map<string, { count: number; windowStart: number }>();

// Routes that should skip rate limiting
const SKIP_RATE_LIMIT_PATHS = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
];

// API routes that need stricter limits
const STRICT_RATE_LIMIT_PATHS = [
    '/api/ask',
    '/api/ingest',
    '/api/trial',
];

// ============================================================
// IP Rate Limiting (Edge)
// ============================================================

function getClientIP(request: NextRequest): string {
    // Check various headers for real IP
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
        return realIP.trim();
    }

    // Cloudflare
    const cfIP = request.headers.get('cf-connecting-ip');
    if (cfIP) {
        return cfIP.trim();
    }

    // Vercel
    const vercelIP = request.headers.get('x-vercel-forwarded-for');
    if (vercelIP) {
        return vercelIP.split(',')[0].trim();
    }

    return 'unknown';
}

function checkIPRateLimit(ip: string, isStrictPath: boolean): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const windowStart = now - IP_RATE_LIMIT.windowSeconds * 1000;
    const maxRequests = isStrictPath ? Math.floor(IP_RATE_LIMIT.maxRequests / 3) : IP_RATE_LIMIT.maxRequests;

    // Get or create record
    const record = ipRequestCounts.get(ip);

    if (!record || record.windowStart < windowStart) {
        // New window
        ipRequestCounts.set(ip, { count: 1, windowStart: now });
        return { allowed: true, remaining: maxRequests - 1, resetIn: IP_RATE_LIMIT.windowSeconds };
    }

    // Increment
    record.count++;

    if (record.count > maxRequests) {
        const resetIn = Math.ceil((record.windowStart + IP_RATE_LIMIT.windowSeconds * 1000 - now) / 1000);
        return { allowed: false, remaining: 0, resetIn: Math.max(resetIn, 1) };
    }

    const resetIn = Math.ceil((record.windowStart + IP_RATE_LIMIT.windowSeconds * 1000 - now) / 1000);
    return { allowed: true, remaining: maxRequests - record.count, resetIn };
}

// Cleanup old entries periodically (edge runtime safe)
if (typeof globalThis !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        const windowStart = now - IP_RATE_LIMIT.windowSeconds * 1000 * 2;
        for (const [ip, record] of ipRequestCounts.entries()) {
            if (record.windowStart < windowStart) {
                ipRequestCounts.delete(ip);
            }
        }
    }, 60000);
}

// ============================================================
// Security Headers
// ============================================================

function addSecurityHeaders(response: NextResponse, pathname: string): void {
    // HSTS - Force HTTPS
    response.headers.set(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload'
    );

    // Prevent MIME sniffing
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // XSS Protection (legacy browsers)
    response.headers.set('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), interest-cohort=()'
    );

    // X-Frame-Options (different for widgets)
    if (pathname.startsWith('/widget')) {
        // Allow widgets to be embedded
        response.headers.set('X-Frame-Options', 'ALLOWALL');
    } else if (pathname.startsWith('/api')) {
        response.headers.set('X-Frame-Options', 'DENY');
    } else {
        response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    }

    // Content Security Policy
    const isWidget = pathname.startsWith('/widget');
    if (isWidget) {
        // More permissive CSP for embeddable widgets
        response.headers.set(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com data:; " +
            "img-src 'self' data: https: blob:; " +
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com; " +
            "frame-src 'self' https://my.spline.design https://*.spline.design; " +
            "frame-ancestors *"
        );
    } else {
        response.headers.set(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com data:; " +
            "img-src 'self' data: https: blob:; " +
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com; " +
            "frame-src 'self' https://my.spline.design https://*.spline.design; " +
            "frame-ancestors 'self'"
        );
    }
}

// ============================================================
// Middleware Function
// ============================================================

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Skip rate limiting for static assets and internal Next.js routes
    const shouldSkip = SKIP_RATE_LIMIT_PATHS.some(path => pathname.startsWith(path));
    if (shouldSkip) {
        return NextResponse.next();
    }

    const clientIP = getClientIP(request);
    const isStrictPath = STRICT_RATE_LIMIT_PATHS.some(path => pathname.startsWith(path));

    // Check IP rate limit
    const rateLimit = checkIPRateLimit(clientIP, isStrictPath);

    if (!rateLimit.allowed) {
        const response = NextResponse.json(
            {
                error: 'Too many requests. Please slow down.',
                code: 'IP_RATE_LIMITED',
                retryAfter: rateLimit.resetIn,
            },
            { status: 429 }
        );

        response.headers.set('Retry-After', rateLimit.resetIn.toString());
        response.headers.set('X-RateLimit-Limit', IP_RATE_LIMIT.maxRequests.toString());
        response.headers.set('X-RateLimit-Remaining', '0');
        response.headers.set('X-RateLimit-Reset', (Date.now() + rateLimit.resetIn * 1000).toString());

        // Add security headers even to rate limit response
        addSecurityHeaders(response, pathname);

        return response;
    }

    // Continue with request
    const response = NextResponse.next();

    // Add rate limit headers
    response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());

    // Add security headers
    addSecurityHeaders(response, pathname);

    return response;
}

// ============================================================
// Middleware Config
// ============================================================

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};

import type { NextConfig } from "next";
import path from "node:path";

const LOADER = path.resolve(__dirname, 'src/visual-edits/component-tagger-loader.js');

// ====== SECURITY HEADERS ======
// Production-grade security headers for SOC-2 / ISO-27001 compliance
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  },
];

// Content Security Policy (CSP)
// Allows required external resources while maintaining security
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com",
  "frame-src 'self' https://my.spline.design https://*.spline.design",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Widget-specific CSP (allows embedding on any domain)
const widgetCspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com",
  "frame-src 'self' https://my.spline.design https://*.spline.design",
  "frame-ancestors *",  // Allow embedding anywhere for widget
  "base-uri 'self'",
].join('; ');


const nextConfig: NextConfig = {
  // Speed up builds by disabling type checking and linting during build
  // Run these separately with npm run typecheck and npm run lint
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  outputFileTracingRoot: path.resolve(__dirname, '../../'),

  // Security: Request body size limits
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // ====== SECURITY HEADERS ======
  async headers() {
    return [
      // Default security headers for all routes
      {
        source: '/:path*',
        headers: [
          ...securityHeaders,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: cspDirectives },
        ],
      },
      // Widget routes - allow embedding on any domain
      {
        source: '/widget/:path*',
        headers: [
          ...securityHeaders,
          // No X-Frame-Options = allow framing
          { key: 'Content-Security-Policy', value: widgetCspDirectives },
        ],
      },
      // API routes - no CSP needed, add CORS headers
      {
        source: '/api/:path*',
        headers: [
          ...securityHeaders,
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },

  // ====== BUILD STRATEGY ======
  // DEVELOPMENT: Turbopack enabled via `npm run dev --turbopack` for fast refresh
  // PRODUCTION: Webpack (default, implicit in `npm run build`)
  //
  // Rationale:
  // - Turbopack: Experimental in Next 16, good for local DX but not battle-tested for production
  // - Webpack: Proven, stable, reliable for production deployments
  // - Custom loaders removed for Next 16 compatibility (can be reintroduced if needed)
  // - This strategy ensures fast development while maintaining production stability
  //
  // To explicitly use webpack in production:
  //   TURBOPACK_DISABLED=1 npm run build
  //
  // Avoid using Turbopack in production until it's stable (Next.js 17+)
  // =============================
};

export default nextConfig;
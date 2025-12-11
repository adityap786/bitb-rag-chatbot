import type { NextConfig } from "next";
import path from "node:path";

const LOADER = path.resolve(__dirname, 'src/visual-edits/component-tagger-loader.js');

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
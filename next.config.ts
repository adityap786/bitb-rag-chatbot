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
  // Note: custom Turbopack rules and `eslint` option removed for Next 16 compatibility.
  // If you need custom loaders, reintroduce them after verifying Turbopack stability.
};

export default nextConfig;
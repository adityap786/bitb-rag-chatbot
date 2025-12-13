import { defineConfig } from 'vitest/config';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

const COVERAGE_ENABLED = process.env.VITEST_COVERAGE === '1' || process.env.CI === 'true' || process.env.CI === '1';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.js',
      'src/lib/**/*.test.ts',
    ],
    // By default exclude long-running integration and E2E tests. Run them
    // explicitly via `npm run test:integration` or `npm run test:e2e`.
    exclude: ['tests/e2e/**', 'tests/integration/**'],
    // setupFiles runs before the test framework is initialized and is a good
    // place to set safe defaults for env vars and lightweight global test
    // initialization (mocks, stubs, etc.).
    setupFiles: ['tests/setup.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_URL: 'https://test.supabase.co',
      REDIS_URL: 'redis://localhost:6379',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      GROQ_API_KEY: 'test-key',
      GROQ_MODEL: 'llama-3.3-70b-versatile',
    },
    testTimeout: 15000, // 15s per test to avoid hangs
    maxConcurrency: 2, // Lower concurrency for stability on all systems
    coverage: {
      provider: 'v8',
      enabled: COVERAGE_ENABLED,
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'json'],
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
      exclude: ['**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

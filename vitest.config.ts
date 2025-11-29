import { defineConfig } from 'vitest/config';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

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
    coverage: {
      provider: 'v8',
      enabled: true,
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'json'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
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

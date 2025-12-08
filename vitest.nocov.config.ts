import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.js'],
    exclude: ['tests/e2e/**', 'tests/integration/**'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      enabled: false,
    },
  },
});

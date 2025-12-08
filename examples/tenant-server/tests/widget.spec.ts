import { test, expect } from '@playwright/test';

// This test assumes the example tenant server is running at http://localhost:3000
// Start it with `npm run dev` in `examples/tenant-server` before running tests.

test('tenant server injects loader script with data-token', async ({ page }: any) => {
  await page.goto('http://localhost:3000');

  const loader = page.locator('script[data-token]');
  await expect(loader).toHaveCount(1);

  const token = await loader.getAttribute('data-token');
  expect(token).toBeTruthy();
});

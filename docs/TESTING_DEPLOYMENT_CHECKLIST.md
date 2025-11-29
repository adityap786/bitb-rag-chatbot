# Testing & Deployment Checklist

This checklist is designed to help you safely promote `bitb-widget` changes from development → staging → production while preserving tenant safety and minimizing downtime.

---

## Pre-deploy (developer)
- [ ] Run unit tests and linters locally. Fix failing tests.
- [ ] Bump widget version and publish a versioned build to the CDN (e.g., `v1.2.3`).
- [ ] Build production assets (`npm run build`) and verify artifact sizes.

## Staging environment (required)
- [ ] Deploy to a staging API + staging CDN domain.
- [ ] Create a staging tenant with real-ish content and several integration variants (Shopify, Wix, WordPress).
- [ ] Validate token minting: tenant server successfully requests token from staging API.
- [ ] Validate loader script loads on tenant pages (embedding tests for each platform).
- [ ] CSP validation: test with the tenant's CSP header set to recommended policy; verify loader still runs.
- [ ] Consent flows: simulate a user revoking consent and verify transcripts are not recorded.
- [ ] Smoke tests: conversation flows, error handling, reconnects.

## Automated tests
- [ ] Integration tests for token mint API (`/api/mint-token`) covering valid/invalid tenant API key, origin mismatch, expired token.
- [ ] End-to-end (Playwright/Cypress) tests that load example pages for each platform and verify:
  - script loads successfully
  - widget initializes within X seconds
  - token exchange occurs securely
  - conversation sends/receives messages
- [ ] Load test: simulate N concurrent clients to the widget init flow and API to assert autoscaling behavior and acceptable latency.

### Example Playwright test snippet (concept)
```ts
import { test, expect } from '@playwright/test';

test('widget loads and initializes', async ({ page }) => {
  await page.goto('https://staging-tenant.example/test-widget.html');
  await expect(page.locator('#bitb-widget-root')).toBeVisible({ timeout: 10000 });
});
```

## Canary & rollout
- [ ] Canary deploy to 1–5% of tenants or traffic. Monitor errors and latency for 12–24 hours.
- [ ] Increase rollout stepwise (5% → 25% → 50% → 100%) with health checks between steps.
- [ ] Keep previous widget bundle available on CDN to allow instant rollback by switching `src` references or changing a feature flag.

## Deployment (production)
- [ ] Deploy backend code and database migrations (if any) with out-of-band DB checks.
- [ ] Publish widget to CDN with cache-control headers and version tags.
- [ ] Update docs/INTEGRATION_SNIPPETS.md with new CDN path and SRI hash (if used).
- [ ] Verify metrics/alerts: error-rate, 5xx rate, token mint failures, latency percentiles.

## Post-deploy verification
- [ ] Smoke test critical tenants (signin, init, basic conversation flows).
- [ ] Confirm monitoring dashboards show normal behavior.
- [ ] Confirm SLOs are met; escalate if any alert thresholds exceeded.

## Rollback plan
- [ ] Switch tenants to previous CDN asset (versioned path) or toggle feature flag to disable new behavior.
- [ ] Revoke any accidentally published keys and rotate secrets if needed.
- [ ] Run incident post-mortem and apply remediation.

## Post-release tasks
- [ ] Run a privacy & security scan on production endpoints.
- [ ] Confirm that the release notes are published and tenants are notified if breaking changes exist.
- [ ] Schedule a follow-up check (24–72 hours) to ensure no latent issues.

---

## Quick commands (local dev)
- Run unit tests and watch:
```powershell
npm run test:unit
```
- Run Playwright tests (Chrome emulation):
```powershell
npx playwright test
```
- Build and publish a versioned widget bundle (example):
```powershell
npm run build --workspace=widget
# then upload `dist/v1.2.3/bitb-widget.js` to CDN
```

---

## Files created
- `docs/TESTING_DEPLOYMENT_CHECKLIST.md`

If you'd like, I can scaffold an example tenant-server repo (`examples/tenant-server`) that implements the secure token endpoint and a sample SSR injection (Next.js), plus a Playwright test that verifies the widget loads. Would you like me to create that now?
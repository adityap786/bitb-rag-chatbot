# Onboarding → RAG Pipeline Audit (Evidence Run: onboarding-audit-20251213-013356)

## Evidence
- Route inventory: `restore-evidence/onboarding-audit-20251213-013356/api-routes.txt`
- Onboarding route subset: `restore-evidence/onboarding-audit-20251213-013356/onboarding-route-map.txt`
- Build output: `restore-evidence/onboarding-audit-20251213-013356/logs/build.log`
- Dependency install: `restore-evidence/onboarding-audit-20251213-013356/logs/npm-ci-2.log`
- Targeted onboarding tests: `restore-evidence/onboarding-audit-20251213-013356/logs/onboarding-tests.log`

## High-priority findings
### 1) Pipeline state must not use `tenants.status`
- Production schema constrains `tenants.status` to lifecycle values (pending/provisioning/active/etc).
- Previous pipeline code attempted to write `processing/ready/failed` into `tenants.status`, which can silently fail (schema drift) and breaks duplicate-job protection.
- Remediation applied:
  - Duplicate job detection uses `ingestion_jobs` state.
  - RAG pipeline no longer persists pipeline state into tenant lifecycle status.

### 2) Dual/legacy onboarding stacks exist
The codebase currently contains both:
- `/api/trial/*` flow (JWT setupToken, tenants table)
- `/api/start-trial` + `/api/ingest` flow (trial_token + trials table patterns)

This increases maintenance risk and makes contracts ambiguous.

### 3) Build-time side effects and bundler warnings
- `next build` produced warnings about overly broad file patterns and showed repeated `ECONNREFUSED 127.0.0.1:6379` errors during build output.
- This strongly suggests queue/redis initialization is happening at import-time for some modules that are pulled into route builds.

## Contract summary
See:
- `docs/api-contracts.md`
- `docs/assumptions.md`

## Suggested PR sequence
- PR A (contracts/docs + guardrails):
  - Keep `/api/trial/*` as canonical and document payloads/statuses.
  - Add contract tests for readiness and processing responses.
  - Deprecation note for legacy `/api/start-trial` and `/api/ingest`.
- PR B (runtime hardening):
  - Remove build-time queue/redis side effects.
  - Unify SSE streaming endpoints (optional) or document canonical one.
  - Loader gating/rehydration improvements if needed.

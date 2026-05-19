# Multi-Tenant Integration Test Plan

## Overview
This document describes the integration test strategy for onboarding, pipeline, and admin flows in a multi-tenant environment. All tests use open source tools and mock tenants/plugins.

## Test Coverage
- Onboarding: Tenant creation, config, DB/resource setup
- Plugin: Registration, enable/disable, invocation per tenant
- RAG Pipeline: Ingestion, chunking, embedding, retrieval per tenant
- Rate Limiting: Per-tenant enforcement and isolation
- Admin: Superuser config, branding, RBAC

## Tools
- **Vitest** for test runner
- **Supabase** for DB
- **Redis** for rate limiting

## Next Steps
- Add onboarding and pipeline integration tests
- Add admin panel and RBAC tests
- Automate test runs in CI

---

This ensures world-class reliability and correctness for all multi-tenant features.

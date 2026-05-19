# OpenTelemetry Tracing for Multi-Tenant System

## Overview
This module sets up distributed tracing using OpenTelemetry and Jaeger. All traces include tenant context for debugging, SLOs, and audit. Tracing is integrated into all pipeline, plugin, and external service calls.

## Usage
```ts
import { withTenantSpan } from '../lib/observability/tracing';

await withTenantSpan(tenantId, 'embedding-call', async () => {
  // ...external call
});
```

## Key Decisions
- **OpenTelemetry** is the open source standard for distributed tracing.
- **Jaeger** is used as the backend (can be swapped for Tempo/Zipkin).
- All spans include `tenant.id` for multi-tenant observability.
- Tracing is required for all critical pipeline and plugin operations.

---

This enables world-class debugging, performance monitoring, and SLO enforcement in production.

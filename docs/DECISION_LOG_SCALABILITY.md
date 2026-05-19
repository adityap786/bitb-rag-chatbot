# Decision Log: Scalability & Performance

## Plugin System
- Registry is in-memory for O(1) lookup; persistent config in DB for durability.
- All plugin operations are stateless and horizontally scalable.
- Plugins are loaded per tenant at runtime; supports thousands of tenants with minimal overhead.

## Circuit Breakers & Retries
- All external calls are wrapped for resilience; prevents cascading failures.
- Retry logic is exponential backoff for best throughput/latency tradeoff.

## Tracing & Observability
- OpenTelemetry with tenant context for full visibility and SLOs.
- Jaeger backend is open source and horizontally scalable.

## Rate Limiting
- Redis is used for distributed, per-tenant rate limiting; supports high concurrency and fair resource sharing.

## Integration Testing
- All tests are run with open source tools (Vitest, Supabase, Redis) for cost efficiency and reproducibility.

## General
- All components are stateless where possible for horizontal scaling.
- All configs and state are persisted in open source DB (Supabase/Postgres).
- No paid/closed services are used; all infra is open source or free.

---

This log will be updated as further scalability and performance decisions are made.

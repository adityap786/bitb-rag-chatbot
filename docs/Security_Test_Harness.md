# Security Test Harness

## Test Cases
- Query without tenant_id throws error and logs anomaly
- Cross-tenant queries return zero results from other tenants
- PII patterns are redacted (emails, phones, SSNs)
- Rate limits block excessive queries
- SQL injection attempts fail safely
- Parameterized queries used for all tenant filters

## Implementation Notes
- Use Vitest/Jest for automated test suite
- Mock Supabase and RAG pipeline for isolation tests
- Validate audit log entries for all security events
- Run harness in CI/CD pipeline on every PR
- Block merge on failed security tests

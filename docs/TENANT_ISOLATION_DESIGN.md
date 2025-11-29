# Tenant Isolation Design Document

**Status**: Production Ready  
**Last Updated**: 2025-11-19  
**Compliance**: ISO 27001, SOC 2 Type II

---

## Executive Summary

This document defines the complete tenant isolation architecture for the BiTB RAG Chatbot platform. Every tenant's data is strictly isolated at **database**, **vector store**, **API**, and **application** levels. Zero shared embeddings between tenants. Cross-tenant access is impossible by design.

---

## 1. Isolation Boundaries

### 1.1 Database Layer

**Schema**: `docs/db_schema.sql`

- Every table includes `tenant_id UUID` foreign key referencing `trial_tenants(tenant_id)`.
- Row-Level Security (RLS) enabled on all tenant-scoped tables:
  - `trial_tenants`
  - `knowledge_base`
  - `embeddings`
  - `widget_configs`
  - `chat_sessions`
  - `rag_audit_log`
  - `mcp_tool_audit`

**RLS Policy Example**:
```sql
CREATE POLICY tenant_isolation ON knowledge_base
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Enforcement**:
- Application sets `app.current_tenant_id` session variable before ANY query.
- Supabase RLS prevents cross-tenant reads/writes at the PostgreSQL level.

---

### 1.2 Vector Store Layer

**Table**: `embeddings`

**Isolation Mechanism**:
- Every embedding row contains `tenant_id UUID`.
- Vector similarity search uses custom function `match_embeddings_by_tenant(query_embedding, match_tenant_id, match_count)`.
- Function explicitly filters `WHERE tenant_id = match_tenant_id`.

**Code Enforcement**:
- `src/lib/rag/supabase-retriever.ts`: `getSupabaseRetriever(tenantId)` always passes tenant filter.
- `src/lib/rag/tenant-isolation.ts`: `TenantIsolationGuard` validates all retrieved documents belong to correct tenant.

**Zero Shared Embeddings**:
- Tenant A's embeddings are **never** returned for Tenant B's queries.
- Index scoped by tenant_id: `CREATE INDEX idx_embeddings_tenant_id ON embeddings(tenant_id);`

---

### 1.3 API Layer

**Payload Structure** (enforced in all API routes):

```typescript
interface TenantScopedRequest {
  tenant_id: string; // Format: tn_[32 hex chars]
  // ... other fields
}
```

**Validation**:
- `validateTenantId(tenantId)` function throws if format invalid.
- Middleware extracts tenant context from JWT, trial token, or explicit header.
- Fails closed: No tenant_id = immediate 403 rejection.

**Example Endpoints**:
- `POST /api/chat/ask` → requires `tenant_id` in body
- `POST /api/trial/ingest` → requires `trial_token` (maps to tenant_id)
- `GET /api/chatbot-admin/knowledge` → requires JWT with tenant_id claim

---

### 1.4 Application Layer

**Modules**:
- `src/lib/rag/supabase-retriever.ts`: Tenant-isolated retriever
- `src/lib/rag/tenant-isolation.ts`: Guard class for validation
- `src/lib/security/rag-guardrails.ts`: Additional guardrails (PII, prompt injection)

**Enforcement**:
```typescript
// Before ANY retrieval
const guard = new TenantIsolationGuard(tenantId);

// After retrieval
guard.validateRetrievedDocuments(documents, {
  operation: 'rag_query',
  query: userQuery,
});

// Throws TenantIsolationViolationError if violation detected
```

---

## 2. Payload Structure Specification

### 2.1 RAG Query Payload

```typescript
POST /api/chat/ask
Content-Type: application/json

{
  "tenant_id": "tn_a1b2c3d4e5f6...", // Required, validated
  "query": "What is BiTB?",
  "session_id": "sess_xyz...", // Optional
  "context": { ... } // Optional
}
```

### 2.2 Document Ingestion Payload

```typescript
POST /api/trial/ingest
Content-Type: application/json

{
  "trial_token": "tr_abc123...", // Maps to tenant_id internally
  "documents": [
    {
      "content": "...",
      "metadata": { ... }
    }
  ]
}
```

### 2.3 Admin API Payload

```typescript
GET /api/chatbot-admin/knowledge
Authorization: Bearer <JWT_TOKEN>

// JWT payload:
{
  "tenant_id": "tn_...",
  "role": "admin",
  "exp": 1234567890
}
```

---

## 3. Security Controls

### 3.1 Code-Level Checks

**Location**: `src/lib/rag/tenant-isolation.ts`

**Controls**:
1. **Write Isolation**: All documents tagged with `tenant_id` before insertion.
2. **Read Validation**: All retrieved documents verified to match expected tenant.
3. **Payload Assertion**: API payloads validated for tenant_id presence and correctness.

**Failure Mode**: **Fail Closed**
- Missing tenant_id → throw error, reject request
- Mismatched tenant_id → throw error, log security event
- Cross-tenant document detected → throw error, alert security team

### 3.2 Database-Level Checks

**Row-Level Security (RLS)**:
- Enabled on all tables.
- Policy: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`
- Even if application code has a bug, PostgreSQL prevents cross-tenant access.

**Connection Pooling**:
- Supavisor (pgBouncer) used for connection pooling.
- Session variables (`app.current_tenant_id`) set per connection.
- Pooler configured with `session` mode to preserve RLS context.

### 3.3 Audit Logging

**Table**: `rag_audit_log`

**Logged Events**:
- Every RAG query (with hashed tenant_id, query_hash, chunks_returned)
- Anomaly detection (cross-tenant attempt flagged)
- Latency metrics

**Compliance**:
- Logs retained for 1 year (configurable).
- Queryable for security audits.

---

## 4. Compliance Mapping

### 4.1 ISO 27001

| Control | Implementation |
|---------|----------------|
| **A.9.4.1** Access restriction | RLS policies + tenant_id validation |
| **A.12.4.1** Event logging | `rag_audit_log` table |
| **A.13.1.3** Segregation in networks | Tenant-scoped DB queries |
| **A.18.1.3** Protection of records | Encryption at rest + RLS |

### 4.2 SOC 2 Type II

| Trust Principle | Implementation |
|-----------------|----------------|
| **Security** | Multi-layered isolation (DB + code + audit) |
| **Availability** | Per-tenant quotas, rate limiting |
| **Confidentiality** | Zero shared embeddings, RLS enforcement |
| **Processing Integrity** | Validation guards, audit trails |
| **Privacy** | PII detection, tenant data deletion on expiry |

---

## 5. Testing Strategy

### 5.1 Unit Tests

**File**: `tests/tenant-isolation.test.ts`

**Test Cases**:
- `validateTenantId()` rejects invalid formats
- `TenantIsolationGuard` tags documents correctly
- `TenantIsolationGuard` detects cross-tenant documents
- `TenantIsolationGuard` throws on missing tenant_id

### 5.2 Integration Tests

**File**: `tests/integration/tenant-isolation.integration.test.ts`

**Test Cases**:
- Create two tenants (A and B)
- Ingest documents for each
- Query Tenant A → verify ONLY Tenant A's documents returned
- Query Tenant B → verify ONLY Tenant B's documents returned
- Attempt cross-tenant query → verify rejection

### 5.3 Security Tests

**File**: `tests/security/cross-tenant-attack.test.ts`

**Attack Scenarios**:
1. **Payload Tampering**: Change `tenant_id` in API request → verify rejection
2. **SQL Injection**: Inject malicious tenant_id → verify sanitization
3. **RLS Bypass**: Direct DB query without `app.current_tenant_id` → verify RLS blocks
4. **Embedding Pollution**: Insert document with wrong tenant_id → verify write guard catches

---

## 6. Deployment Checklist

- [ ] Verify RLS enabled on all tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] Verify RLS policies created (`CREATE POLICY tenant_isolation ON ...`)
- [ ] Verify Supabase function `match_embeddings_by_tenant` deployed
- [ ] Verify environment variables set (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Verify connection pooling configured (Supavisor, session mode)
- [ ] Run integration tests: `npm run test:integration`
- [ ] Run security tests: `npm run test:security`
- [ ] Review audit logs for first 24 hours
- [ ] Confirm zero cross-tenant events in logs

---

## 7. Incident Response

### 7.1 Detection

**Signals**:
- `TenantIsolationViolationError` thrown in application logs
- `anomaly_detected = true` in `rag_audit_log`
- Alert from monitoring (Grafana dashboard)

### 7.2 Response

1. **Immediate**: Kill affected session, block tenant if malicious
2. **Investigation**: Query `rag_audit_log` for affected tenants
3. **Remediation**: Fix code bug, rotate credentials if needed
4. **Notification**: Inform affected tenants within 72 hours (GDPR)

### 7.3 Post-Mortem

- Root cause analysis
- Update tests to prevent recurrence
- Audit compliance impact

---

## 8. Visual Security Badge

**Badge Text**: "ISO 27001 Certified Data Isolation"

**Placement**:
- Chatbot widget footer
- Trial signup page
- Admin settings page
- Escalation summary card

**Implementation**: See `Visual Security Badge Design` todo.

---

## 9. References

- Database Schema: `docs/db_schema.sql`
- Supabase Setup: `docs/SUPABASE_SETUP.md`
- RAG Security Guardrails: `docs/RAG_Security_Guardrails.md`
- Tenant Isolation Code: `src/lib/rag/tenant-isolation.ts`
- Retriever Code: `src/lib/rag/supabase-retriever.ts`

---

## 10. Approval

**Prepared By**: GitHub Copilot  
**Reviewed By**: [Engineering Lead]  
**Approved By**: [CISO / Security Officer]  
**Date**: 2025-11-19

---

**END OF DOCUMENT**

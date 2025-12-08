# Security Threat Model (STRIDE)

This document summarizes STRIDE-style threats and mitigations for the RAG pipeline and MCP/tool orchestration in the multi-tenant chatbot platform.

| Threat Category | RAG Pipeline Threats | MCP / Tools Threats | Mitigation Strategy | Priority |
|---|---|---|---|---|
| Spoofing | - Malicious tenant_id injection (spoof tenant)
- Forged API requests claiming another tenant | - Unauthorized tool calls using forged identity
- Fake agent/service claiming elevated access | - Authenticate requests with signed tokens (JWT) scoped to tenant
- Verify tenant ownership at API & DB layer (RLS)
- Short-lived tokens + rotating signing keys | High |
| Tampering | - Poisoned KB uploads (prompt injection)
- Embeddings cache manipulation or tampering with vectors | - Manipulated tool parameters causing unintended actions
- Modification of tool metadata/schema by attackers | - Input validation and content-sanitization on KB uploads
- Immutable storage for original KB + signatures
- Audited, versioned embeddings with checksums
- Monitor embeddings drift/anomalies | High |
| Repudiation | - Missing audit trail for retrievals & ingestion
- KB upload or ingestion operations without non-repudiable logs | - Tool executions not logged or missing caller context | - End-to-end audit logging (hash tenant_id, query hashes) in `rag_audit_log`
- Sign and persist operation metadata (who/when/what)
- Centralized audit sink with tamper-evidence | Medium-High |
| Information Disclosure | - Cross-tenant data leakage from missing tenant_id filters
- PII exposed in LLM prompts or responses | - Tool output leaking sensitive data or API keys in errors
- SSRF via URL-based tools returning internal data | - Enforce mandatory tenant_id filter (fail-closed)
- PII redaction before sending to LLMs
- Output filtering, masking, and safe-response templates
- RLS/row-level security on Postgres; parameterized queries | High |
| Denial of Service | - Vector index saturation (high-cost similarity queries)
- Mass KB uploads to drive up LLM costs | - Excessive or malicious tool invocation causing resource exhaustion
- Large file/tool parameter payloads | - Rate-limiting per-tenant (Redis/circuit-breaker)
- Quota enforcement + alerts for cost spikes
- Backpressure & queueing for KB processing | High |
| Elevation of Privilege | - Tool chaining enabling privileged DB operations
- Improperly scoped service role keys used in client code | - Tools executing privileged actions without admin approval | - Least-privilege service accounts, scoped service-role for server only
- Approvals for privilege-requiring steps (admin interrupts)
- Runtime policy checks for tool execution context | High |


## RAG-specific Threats (addressed)
- Tenant data leakage via missing tenant_id filters — Mitigation: fail-closed tenant validation, RLS, query audits.
- Prompt injection via poisoned knowledge base uploads — Mitigation: content sanitization, input validation, KB scoring and sandboxed preview.
- Embeddings cache poisoning — Mitigation: checksums, embedding verification, anomaly detection on embedding similarity distributions.
- Vector similarity manipulation — Mitigation: threshold-based similarity checks, anomaly triggers if similarity distributions change.
- PII exposure in retrieval contexts — Mitigation: redactPII before LLM, redact both stored KB and retrieved chunks returned to LLM.

## MCP/Tool Threats (addressed)
- Unauthorized tool invocation — Mitigation: tool-level auth, tenant-scoped tokens, RBAC for admin tools.
- SSRF via tool parameters — Mitigation: validate/whitelist URLs and use server-side proxy with egress controls.
- Command injection in tool arguments — Mitigation: strict schema validation for tool parameters, typed parameter parsing.
- Privilege escalation via tool chaining — Mitigation: runtime policy checks, capped execution graph depth, admin approval flows.
- API key leakage in error messages — Mitigation: sanitize and redact keys from logs and errors; never return raw stack traces to clients.

## Next Steps
- Publish this file as `docs/SECURITY_THREAT_MODEL.md` so Security and Engineering can iterate.
- Map each mitigation to an owner and assign implementation tasks (SRE/Backend/Platform).
- Integrate threat checks into PR checklist and CI SAST runs.


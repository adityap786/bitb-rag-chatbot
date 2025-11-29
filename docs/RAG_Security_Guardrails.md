# RAG Security Guardrails

## Mandatory Controls

- **Tenant Isolation:**
  - All vector queries must include tenant_id filter
  - Fail closed if tenant_id is missing
- **Context Limits:**
  - Max 5 chunks, 1500 chars each, 6000 total sent to LLM
- **PII Redaction:**
  - Redact emails, phones, SSNs, credit cards, addresses before sending to LLM
- **Audit Trail:**
  - Log every retrieval (timestamp, hashed tenant_id, retriever_id, chunks returned)
- **Rate Limiting:**
  - Trial: 10/min, 100/hr
  - Potential: 30/min, 500/hr
  - Scale: 100/min, 2000/hr
- **Fail-Closed Policy:**
  - If any security check fails, deny request without fallback

## Implementation Notes
- Enforce tenant_id filter in all DB queries and API endpoints
- Use parameterized queries for tenant_id
- Integrate PII redaction in RAG pipeline before LLM call
- Log all retrievals and anomalies to audit log
- Apply rate limiting middleware per tenant tier
- Return 403/429 on failed security checks

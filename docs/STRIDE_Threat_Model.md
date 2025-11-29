# STRIDE Threat Model for Multi-Tenant SaaS Chatbot Platform

| Threat Category | Specific Threats | Mitigation Strategy | Priority |
|----------------|------------------|---------------------|----------|
| **Spoofing**   | - Fake tenant IDs in API calls<br>- Session hijacking via widget<br>- Forged JWT tokens | - Validate tenant_id as UUID<br>- Use signed JWTs with short expiry<br>- Regenerate session_id on refresh<br>- Monitor for >10 failed session attempts | P0 |
| **Tampering**  | - KB/embedding poisoning<br>- Widget script tampering<br>- Audit log manipulation | - SRI hash for widget<br>- Audit log immutability<br>- Input validation on KB uploads<br>- Use parameterized queries | P0 |
| **Repudiation**| - Unlogged RAG queries<br>- Untracked tool invocations<br>- Missing audit trails | - Log all retrievals/tool calls<br>- Hash tenant/session IDs<br>- Store audit logs in append-only table<br>- Alert on missing logs | P1 |
| **Information Disclosure** | - Cross-tenant data leakage<br>- PII exposure in LLM context<br>- Unredacted sensitive info in responses | - Enforce tenant_id filter<br>- Redact PII before LLM<br>- Fail-closed on missing tenant_id<br>- RLS policies in DB | P0 |
| **Denial of Service** | - Excessive RAG queries<br>- Embedding API abuse<br>- Widget spam<br>- LLM cost spikes | - Rate limiting by tier<br>- Alert on anomalous rates/costs<br>- Circuit breaker for LLM/tools<br>- CAPTCHA on widget if needed | P1 |
| **Elevation of Privilege** | - Unauthorized tool invocation<br>- Privilege escalation via MCP<br>- SSRF/command injection | - Typed schemas for tools<br>- Tenant-scoped access<br>- JSON schema validation<br>- Least privilege for service accounts<br>- SAST/DAST scans | P0 |

## Notes
- P0 = Critical, P1 = High, P2 = Medium, P3 = Low
- All mitigations must be enforced at API, DB, and infra levels
- Fail-closed on any security check failure
- Audit and alert on all anomalies

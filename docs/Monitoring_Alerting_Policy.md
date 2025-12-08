# Monitoring & Alerting Policy

## Alert Conditions
- Anomalous RAG retrieval rates (>3x baseline per tenant)
- Missing tenant_id errors (>5 in 10 minutes = critical bug)
- LLM cost spikes (>$100/hour)
- Failed tenant isolation attempts (>1 = critical)
- High PII redaction rate (>30% of queries)
- RAG latency degradation (p95 >2 seconds)
- Embedding service errors (>5% error rate)
- Session hijacking attempts (>10 failures in 5 minutes)

## Implementation Notes
- Integrate alerting with DataDog, Sentry, or similar
- Configure dashboards for all metrics
- Critical alerts trigger immediate incident response
- All alert events logged in audit trail
- Alert thresholds reviewed monthly

# Secrets Enforcement Policy (10-Point)

1. **Never commit secrets to Git**
   - Enforce pre-commit validation using TruffleHog/GitGuardian
2. **Environment-specific secret stores**
   - Use AWS Secrets Manager, HashiCorp Vault, or Doppler
3. **Rotation schedules**
   - API keys: 90 days
   - DB credentials: 180 days
   - JWT keys: 365 days
4. **Least privilege access per service**
   - Restrict secret access to only required services
5. **Encryption at rest and in transit**
   - Use KMS for encryption at rest
   - TLS 1.3 for all secret transmission
6. **Audit logging for all secret access**
   - Log every secret access event with timestamp and actor
7. **Separate secrets per environment**
   - Isolate dev, staging, and prod secrets
8. **Short-lived tokens where possible**
   - Prefer expiring tokens for API and session keys
9. **Platform-native injection**
   - Inject secrets via environment variables, not CLI args
10. **Emergency revocation procedure**
    - 1-hour SLA for revoking compromised secrets
    - Documented runbook for emergency rotation

## Implementation Notes
- Integrate secret scanning in CI/CD and pre-commit hooks
- Store runbook in encrypted vault, not in code
- Use parameterized queries for all DB access
- Monitor and alert on secret access anomalies

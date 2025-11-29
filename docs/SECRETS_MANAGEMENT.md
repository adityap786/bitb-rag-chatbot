# Secrets & Configuration Management

This document describes the enforced policies and practical steps for secret management across environments (dev, staging, production).

## 10-Point Enforcement Policy (summary)

1. Never commit secrets to version control.
   - Use a pre-commit hook to scan commits for secrets (examples: `git-secrets`, `trufflehog`, `pre-commit` hooks).
2. Use environment-specific secret stores.
   - Dev: `.env.local` (gitignored).
   - Staging/Prod: AWS Secrets Manager, HashiCorp Vault, Doppler, or similar.
3. Rotate secrets on schedule.
   - API keys: every 90 days; DB creds: every 180 days; JWT signing keys: yearly.
4. Principle of least privilege.
   - Each service has narrowly-scoped credentials.
5. Encrypt secrets at rest and in transit.
   - Use KMS; require TLS for secret retrieval.
6. Audit secret access.
   - Log every secret read operation; alert on anomalous access.
7. Separate secrets per environment.
8. Implement secret expiration & short-lived tokens where possible.
9. Secure secret injection.
   - Use platform-native injection (Vercel/AWS env vars). Avoid passing secrets on command line.
10. Emergency revocation procedure.
    - Documented steps to rotate/evict compromised credentials; practice quarterly.

## Validation at Startup (example)

Place a lightweight validation check in server/bootstrap code to fail fast if required secrets are missing.

```typescript
// config/secrets-check.ts (reference template)
export function validateSecrets(): void {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'OPENAI_API_KEY' // if used
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    // Fail closed in non-development environments
    const msg = `Missing required secrets: ${missing.join(', ')}`;
    // Consider logging to stderr and exiting in production start-up
    throw new Error(msg);
  }
}
```

## Pre-commit & CI Secret Scanning

- Add a pre-commit hook that runs a fast secret scanner (e.g. `git-secrets` or `trufflehog --entropy=False --rules`), returning non-zero on match.
- CI should run a deeper scan on PRs (trufflehog/gitleaks) and fail builds for matches.

### Example: pre-commit step (local)

```bash
# Example (not enabled automatically):
# Install git-secrets and add common patterns
git secrets --register-aws
git secrets --add 'OPENAI_API_KEY'

# Add a small wrapper script in ./scripts/pre-commit-check.sh to call git-secrets/trufflehog
```

## Secrets Rotation & Emergency Response

- Maintain an inventory of secrets and owners in a secure vault.
- Provide runbooks for emergency rotation (who rotates, how to update services, how to verify).
- Automate rotation where vendor supports short-lived credentials.

## Logging & Auditing

- Record who accessed which secret and when (via Vault or Secrets Manager logs).
- Alert on unusual read patterns (e.g., mass reads, reads from unexpected hosts).

## Recommended Tools

- Small/Open Source: `git-secrets`, `gitleaks`, `trufflehog`, `pre-commit`
- Enterprise: Vault, Doppler, AWS Secrets Manager, GitHub Secrets + OIDC for CI

## Next Steps
- Add a `scripts/pre-commit-check.sh` that runs the chosen scanner, and add instructions to `README.md`.
- Wire CI secret-scan job (see `.github/workflows/security-scan.yml`).

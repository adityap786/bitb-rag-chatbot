# Security Pipeline (CI/CD) Structure

## Jobs Overview

### 1. SAST (Static Application Security Testing)
- **Tool:** Semgrep or CodeQL
- **Rules:** OWASP Top 10
- **Trigger:** On PR, push to main
- **Artifacts:** SAST report

### 2. Dependency Scanning
- **Tool:** Snyk or Dependabot
- **Severity Threshold:** High+
- **Trigger:** On PR, weekly schedule
- **Artifacts:** Dependency report

### 3. Secret Scanning
- **Tool:** TruffleHog or GitGuardian
- **Trigger:** Pre-commit, on PR
- **Artifacts:** Secret scan report

### 4. Container Scanning
- **Tool:** Trivy or Grype
- **Trigger:** On Docker build, weekly schedule
- **Artifacts:** Container scan report

### 5. DAST (Dynamic Application Security Testing)
- **Tool:** OWASP ZAP
- **Trigger:** Weekly in staging
- **Artifacts:** DAST report

## Workflow Structure (Describe Only)
- **sast:** Run Semgrep/CodeQL, upload report
- **dependency-scan:** Run Snyk/Dependabot, fail on High+ severity
- **secret-scan:** Run TruffleHog/GitGuardian, block on secret found
- **container-scan:** Run Trivy/Grype, upload report
- **dast:** Run OWASP ZAP baseline scan, upload report
- **notify:** Send summary to Slack/Teams if any job fails

## Notes
- All jobs run in parallel except DAST (runs in staging only)
- Reports stored as CI artifacts
- PRs blocked on critical findings
- Pre-commit hooks for secret scanning

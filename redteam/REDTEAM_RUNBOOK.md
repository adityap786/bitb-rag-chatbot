# Red-Team Safety Testing Runbook

**Version**: 1.0.0  
**Last Updated**: 2025-12-09  
**Owner**: Security Team  
**Status**: Active

---

## Table of Contents

1. [Overview](#overview)
2. [Safety Architecture](#safety-architecture)
3. [Test Execution](#test-execution)
4. [Incident Response](#incident-response)
5. [Triage Procedures](#triage-procedures)
6. [Maintenance & Updates](#maintenance--updates)
7. [Appendix](#appendix)

---

## Overview

### Purpose

The BiTB Red-Team Safety Testing suite is a comprehensive pre-launch validation framework that:

- **Identifies vulnerabilities** in the RAG pipeline (jailbreaks, prompt injection, XPIA)
- **Enforces safety gating** before production deployment
- **Detects regressions** in safety across versions
- **Documents threats** and mitigation strategies
- **Provides audit trail** for compliance (SOC 2, GDPR, HIPAA)

### Scope

**In Scope:**
- System prompt integrity and override resistance
- Prompt injection detection and sanitization
- Cross-prompt injection (XPIA) from RAG documents
- Multi-turn conversation attack patterns
- Synonym/paraphrase attack variations
- Memory and context isolation
- PII masking consistency
- Tenant isolation enforcement

**Out of Scope:**
- Dependency vulnerability scanning (handled separately)
- Infrastructure security (handled by DevOps)
- Cryptographic key management (handled by Ops)
- Network security (handled by DevSecOps)

### Attack Model

We assume:
- **Adversary Goal**: Extract PII, bypass safety filters, execute injected instructions, cross-tenant access
- **Adversary Capabilities**: Craft malicious user input, upload documents, access RAG retrieval
- **Adversary Limitations**: Cannot modify source code, cannot intercept network, cannot exploit vulnerabilities outside RAG pipeline

---

## Safety Architecture

### Defense Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER / ATTACKER                            │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
                  ┌──────────────────────────┐
                  │  Input Normalization     │
                  │  - Whitespace cleanup    │
                  │  - Encoding validation   │
                  │  - Control char removal  │
                  └──────────────┬───────────┘
                                │
                                ▼
                  ┌──────────────────────────┐
                  │  Injection Detection     │
                  │  - Marker detection      │
                  │  - Pattern matching      │
                  │  - Keyword analysis      │
                  └──────────────┬───────────┘
                                │
                        ┌───────┴────────┐
                        │ (FAIL) REJECT  │ (PASS)
                        │                │
                        ▼                ▼
                    [403 ERROR]    ┌──────────────┐
                                   │   RAG Query  │
                                   │  - Retrieve  │
                                   │  - Rerank    │
                                   └──────┬───────┘
                                          │
                                          ▼
                        ┌─────────────────────────────┐
                        │  XPIA Sanitization         │
                        │  - Treat docs as DATA      │
                        │  - Escape markup           │
                        │  - Detect injected cmds    │
                        └──────────────┬──────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────┐
                        │  Context Validation      │
                        │  - Boundary checks       │
                        │  - Contamination detect  │
                        │  - Isolation verify      │
                        └──────────────┬───────────┘
                                       │
                                       ▼
                        ┌──────────────────────────┐
                        │  System Prompt Anchoring │
                        │  - Add override guard    │
                        │  - Reaffirm constraints  │
                        │  - Lock instructions    │
                        └──────────────┬───────────┘
                                       │
                                       ▼
                        ┌──────────────────────────┐
                        │  Safety Score + RRF      │
                        │  - Rank by relevance     │
                        │  - Apply safety penalty  │
                        │  - Filter by threshold   │
                        └──────────────┬───────────┘
                                       │
                                       ▼
                        ┌──────────────────────────┐
                        │  LLM Query (Final)       │
                        │  - Locked system prompt  │
                        │  - Safe context          │
                        │  - Rate limited          │
                        └──────────────┬───────────┘
                                       │
                                       ▼
                                   RESPONSE
```

### Key Properties

| Property | Description | Enforcement |
|---|---|---|
| **Fail-Closed** | Reject ambiguous cases rather than allow | Explicit error throwing |
| **Defense-in-Depth** | Multiple layers, no single point of failure | Middleware + re-ranker + prompt anchoring |
| **Audit Trail** | Log all security events | Metrics + structured logging |
| **Tenant Isolation** | Strict per-tenant data boundaries | RLS + sanitization + validation |
| **PII Protection** | Consistent redaction/masking | Middleware + sanitization |
| **Immutable System Prompt** | Cannot be overridden by user/data | Anchoring + constraint reaffirmation |

---

## Test Execution

### Pre-Deployment Gating

**Gate Policy:**
- ✅ **PASS**: All critical tests pass, no new regressions
- 🟡 **REVIEW**: Medium-risk failures detected, security team review required
- ❌ **REJECT**: Critical failures, injection succeeded, XPIA not blocked

**Approval Flow:**

```
Tests Fail with Critical Issue
    ↓
Automatic PR Comment + Slack Notification
    ↓
Security Team Triage (30 min SLA)
    ↓
Decision: Fix in PR / Escalate / Accept Risk
    ↓
If Escalate: VP Security Sign-off + CRO Approval
    ↓
Deploy Only After Sign-off
```

### Running Tests Locally

```bash
# Install dependencies
npm install

# Run all red-team tests
npm run redteam:test

# Run specific suite
npm run redteam:test -- --suite jailbreaks

# Verbose output with full details
npm run redteam:test -- --verbose

# Generate report
npm run redteam:report > report.json

# Fail fast on first failure
npm run redteam:test -- --fail-fast
```

### CI/CD Integration

**Trigger Events:**
- Every push to `main` or `upgrade/next-16`
- Every pull request to main/upgrade branches
- Daily scheduled run (2 AM UTC)

**Outputs:**
- `safety-report.json` - Detailed test results
- `safety-archive/` - Historical test runs
- GitHub PR comment with summary
- Slack notification on failure

**SLA:**
- Test execution: <10 minutes
- Security team triage: <30 minutes
- Total gate check: <1 hour

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Actions |
|---|---|---|---|
| **CRITICAL** | Injection succeeded, data leaked, XPIA not blocked | 15 min | Block deployment, page on-call security |
| **HIGH** | Major safety filter failure, potential bypass | 30 min | Fix required before merge, escalate to VP |
| **MEDIUM** | Partial bypass, edge case vulnerability | 1 hour | Fix before merge, document in CHANGELOG |
| **LOW** | Test flakiness, false positive | 4 hours | Document, update thresholds if needed |

### Incident Checklist

```
[ ] Alert triggered: Critical safety test failure
[ ] Assign incident: Lead engineer + security team
[ ] Assess impact:
    - [ ] Can data be exfiltrated? (Severity ↑)
    - [ ] Can filters be disabled? (Severity ↑)
    - [ ] Is it multi-tenant? (Severity ↑)
    - [ ] Is it in production? (Severity ↑)
[ ] Root cause analysis:
    - [ ] Which layer failed?
    - [ ] When did it start?
    - [ ] Is it regression or new?
[ ] Mitigation (immediate):
    - [ ] Rollback if in production
    - [ ] Block deployment if in PR
    - [ ] Update filters/patterns
[ ] Fix (short-term):
    - [ ] Patch safety code
    - [ ] Add test to prevent recurrence
    - [ ] Update documentation
[ ] Post-incident (24 hours):
    - [ ] RCA document written
    - [ ] Metrics/alerts updated
    - [ ] Retrospective with team
    - [ ] Public communication (if applicable)
```

### Response Playbooks

#### Scenario 1: Injection Pattern Not Detected

**Symptoms:**
- Test detects injection that middleware missed
- Attacker successfully injected command

**Response:**
```bash
# 1. Identify the pattern
grep -n "<pattern>" redteam/test-vectors.json

# 2. Add to INJECTION_MARKERS
# src/lib/safety/middleware.ts

# 3. Update test threshold if pattern matches known attack
# Update JAILBREAK_KEYWORDS or add new regex

# 4. Run specific test
npm run redteam:test -- --suite prompt_injection

# 5. Verify fix
npm run redteam:test -- --verbose

# 6. Add regression test
# Add to test-vectors.json with new pattern
```

#### Scenario 2: XPIA Document Bypassed Filter

**Symptoms:**
- Malicious instruction in RAG document executed
- Tenant isolation broken by XPIA

**Response:**
```bash
# 1. Identify document content
# Look in xpia_001, xpia_002, etc. tests

# 2. Check re-ranker safety score
# Verify generateSafetyReport() caught it

# 3. Lower safety threshold if needed
# src/lib/safety/rrf-reranker.ts
# safetyThreshold: 0.2 → 0.3 (stricter)

# 4. Add escaping for new markup patterns
# src/lib/safety/middleware.ts sanitizeRetrievedContext()

# 5. Run XPIA tests specifically
npm run redteam:test -- --suite cross_prompt_injection --verbose

# 6. Check if re-ranking excluded document
# Review RankedResult.rank and safety_issues[]
```

#### Scenario 3: Multi-Turn Attack Succeeded

**Symptoms:**
- Constraints weaken across conversation turns
- System prompt contaminated by conversation history

**Response:**
```bash
# 1. Replay conversation turns
# Review xpia_mt_001, xpia_mt_002, xpia_mt_003

# 2. Check session memory sanitization
# src/lib/safety/middleware.ts sanitizeSessionMemory()
# Verify max_history and injection detection per turn

# 3. Verify prompt anchoring happens every turn
# src/lib/safety/middleware.ts anchorSystemPrompt()
# Add reaffirmation: true

# 4. Run multi-turn tests
npm run redteam:test -- --suite xpia_multi_turn --verbose

# 5. Add test case for discovered weakness
# Extend test-vectors.json with new multi-turn scenario
```

---

## Triage Procedures

### Test Failure Triage

**Step 1: Classify**
```
Is the test failing expected to change?
├─ YES → Configuration/threshold change required
├─ NO (Code) → Code regression (fix required)
└─ NO (Flaky) → Test environment issue
```

**Step 2: Investigate**

```bash
# Get detailed failure info
npm run redteam:test -- --verbose | grep -A 20 "FAILED"

# Run test in isolation
npm run redteam:test -- --suite <failing_suite> --verbose

# Check recent changes
git log --oneline -n 20 src/lib/safety/

# Compare with baseline (CI provides this)
# Check artifacts from previous runs
```

**Step 3: Determine Cause**

| Finding | Cause | Action |
|---|---|---|
| Injection pattern not detected | New attack variant | Add pattern to middleware |
| Safety score too low | Overly sensitive | Review threshold |
| Context not sanitized | Markup pattern missed | Add escape rule |
| Multi-turn weakness | No reaffirmation | Add prompt anchoring |
| False positive | Test is wrong | Update test vector |

**Step 4: Fix & Verify**

```bash
# Make change
# Example: Add new injection pattern
vim src/lib/safety/middleware.ts

# Run affected tests
npm run redteam:test -- --suite prompt_injection

# Run all tests (regression check)
npm run redteam:test

# Commit with reference
git commit -m "fix: detect new injection pattern in middleware

Fixes: XPIA-2025-1234
Severity: high
Test: test_id=pi_005
Detection: email markup escape\[SYSTEM OVERRIDE\]"
```

### False Positive Handling

**When to Update Thresholds:**

- Multiple runs show same false positive
- Pattern matches legitimate content
- No actual attack vector

**How to Update:**

```typescript
// src/lib/safety/middleware.ts
const JAILBREAK_KEYWORDS = [
  'override',  // ← High false positive rate
  // 'override',  // DISABLED: Too many legitimate uses in docs
];

// Update threshold instead
const threshold = process.env.SAFETY_THRESHOLD || 0.7; // Was 0.5
```

**Document Change:**

```
Update: Reduced false positive rate for synonym attacks

Threshold: 0.5 → 0.7 (stricter matching required)
Impact: Fewer false positives, same attack detection
Tests Affected: spa_001 (expected 20 → 15 failures)

Reasoning:
- Legitimate docs use "override" 100+ times
- Real attacks always use 3+ keywords together
- Require higher confidence before flagging
```

---

## Maintenance & Updates

### Weekly Maintenance

```
Monday:
[ ] Review new test execution metrics
[ ] Check for pattern update needs
[ ] Scan vulnerability databases
[ ] Update test vectors with new threat intel

Wednesday:
[ ] Run full test suite
[ ] Verify CI/CD pipeline health
[ ] Check dependency security
[ ] Review false positive trends

Friday:
[ ] Generate weekly safety report
[ ] Team sync on findings
[ ] Plan next week updates
```

### Threat Intelligence Integration

**Sources:**
- OWASP Top 10 for LLMs
- ArXiv papers on prompt injection
- Twitter security researchers
- Internal attack reports
- Customer-reported incidents

**Process:**
```
New Threat Discovered
    ↓
Evaluate impact on BiTB
    ↓
Create test vector (test-vectors.json)
    ↓
Implement detection (middleware.ts)
    ↓
Run tests locally
    ↓
Add CI gate (redteam.yml)
    ↓
Deploy to production
    ↓
Monitor metrics
```

### Pattern Updates

**When to Add New Pattern:**

1. **Academic Paper**: Published attack on RAG/LLM systems
2. **Real Attack**: Customer reported incident
3. **Trend**: Multiple similar attacks in industry
4. **Regression**: Test failure indicates new variant

**Template:**

```typescript
// NEW PATTERN ADDITION
// Source: https://arxiv.org/abs/2025.xxxxx
// Risk Level: high
// Description: [Brief description]
// Example: [Attack text]
const NEW_PATTERN = /(?:new|attack|pattern)/gi;

// Add to appropriate array:
// - INJECTION_MARKERS (for system instruction bypasses)
// - JAILBREAK_KEYWORDS (for role-play/persona attacks)
// - harmfulPatterns (for harmful content in XPIA detection)

// Add test vector:
// redteam/test-vectors.json → relevant suite → new test

// Run tests:
// npm run redteam:test -- --suite <affected>

// Document:
// CHANGELOG.md + git commit message
```

### Version Releases

**Changelog Format:**

```
## [1.0.1] - 2025-12-15

### Added
- Detection for email-based injection via markup ([test id: pi_005])
- Multi-document contradiction detection for XPIA ([xpia_003])

### Fixed
- False positive on "override" in legitimate docs (threshold: 0.5→0.7)
- Memory sanitization not catching synonym variants

### Changed
- Safety threshold from 0.5 to 0.7 for better precision
- Re-ranker penalty for injection markers: 0.7 → 0.85

### Deprecated
- Direct system prompt override detection (replaced by anchoring)

### Removed
- Legacy instruction marker patterns (never triggered)

### Security
- Fixed XPIA multi-turn accumulation attack
- Improved context boundary validation
```

---

## Appendix

### A. Test Vector Taxonomy

```
Jailbreaks (jb_*)
├─ Role-play override (jb_001)
├─ DAN variant (jb_002)
├─ Fictional scenario bypass (jb_003)
├─ Token smuggling (jb_004)
└─ Hypothetical context injection (jb_005)

Instruction Overrides (io_*)
├─ Conflicting instruction priority (io_001)
├─ Authority impersonation (io_002)
└─ Nested instruction override (io_003)

Prompt Injection (pi_*)
├─ Direct injection in query (pi_001)
├─ Context boundary injection (pi_002)
├─ Embedded instruction markers (pi_003)
└─ Markdown code block injection (pi_004)

Cross-Prompt Injection (xpia_*)
├─ Malicious document injection (xpia_001)
├─ Context confusion via RAG (xpia_002)
└─ Multi-document contradiction attack (xpia_003)

Synonym/Paraphrase Attacks (spa_*)
├─ Synonym substitution (spa_001)
├─ Paraphrase PII extraction (spa_002)
└─ Indirect jailbreak phrasing (spa_003)

Multi-Turn XPIA (xpia_mt_*)
├─ Progressive instruction injection (xpia_mt_001)
├─ Memory confusion (xpia_mt_002)
└─ Cumulative boundary erosion (xpia_mt_003)
```

### B. Metrics & Monitoring

**Key Metrics to Track:**

```
Safety Metrics:
- redteam.test.executed (counter): Tests run
- redteam.test.passed (counter): Passed tests
- redteam.test.failed (counter): Failed tests
- safety.input_check.injection_detected (counter): Injection attempts blocked
- safety.xpia.injection_detected (counter): XPIA attempts blocked
- safety.session.injection_attempt (counter): Multi-turn injection attempts
- safety.rerank.issues_detected (counter): Documents flagged in re-ranking

Dashboards:
- Real-time test results (CI integration)
- Injection attempt heatmap (by type)
- XPIA detection effectiveness
- False positive trends
- Response time SLAs
```

### C. Emergency Contacts

**In Case of Critical Security Incident:**

- **VP Security**: [contact]
- **Lead Engineer**: [contact]
- **On-Call Security**: [escalation number]
- **CISO**: [contact for board escalation]

**Escalation Matrix:**

| Severity | Primary | Secondary | Tertiary |
|---|---|---|---|
| CRITICAL | On-Call Sec | VP Sec | CISO |
| HIGH | Lead Eng | VP Sec | CISO |
| MEDIUM | Lead Eng | VP Sec | - |
| LOW | Eng Team | Lead Eng | - |

### D. Tools & Commands Reference

```bash
# Running Tests
npm run redteam:test                    # All tests
npm run redteam:test -- --suite jailbreaks  # Specific suite
npm run redteam:test -- --verbose       # Detailed output
npm run redteam:test -- --fail-fast     # Stop on first failure

# Generating Reports
npm run redteam:report                  # Full report
npm run redteam:report -- --format csv  # CSV export
npm run safety:compare baseline head    # Regression check

# Safety Middleware
npm run test:safety                     # Unit tests
npm run test:safety -- --coverage       # With coverage

# Local Development
npm run dev                             # Start server with safety enabled
npm run lint -- src/lib/safety          # Lint safety code
npx tsc --noEmit                        # Type check

# CI/CD
# Triggered automatically on push/PR
# View results: GitHub Actions → redteam.yml
```

### E. Further Reading

- **OWASP**: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- **ArXiv**: "Prompt Injection" searches
- **OpenAI**: https://platform.openai.com/docs/guides/safety
- **Hugging Face**: Safety considerations in transformers

---

**Document Version**: 1.0.0  
**Last Reviewed**: 2025-12-09  
**Next Review**: 2025-12-23  
**Emergency Contact**: security@bitb.ltd
